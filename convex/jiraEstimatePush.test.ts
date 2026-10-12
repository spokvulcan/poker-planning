/// <reference types="vite/client" />
/**
 * The estimate push, from the reveal to how it went: the voting round hands
 * the settled estimate over (ADR-0002), the estimate push decides whether and
 * where it goes (model/estimatePush.ts) and records why when it doesn't, the
 * provider registry dispatches Jira's push, and the push's action writes it
 * to the in-memory Jira (integrations/jira.setup.ts) as the mapping's
 * connection and records that it did, or why it couldn't. Rooms are run the
 * way the app runs them: votes and the reveal through the public mutations.
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { withComponents } from "./components.setup";
import * as EstimatePush from "./model/estimatePush";
import { inMemoryJira, type FakeSite, type InMemoryJira } from "./integrations/jira.setup";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

let jira: InMemoryJira;
let team: FakeSite;
let other: FakeSite;

// convex-test runs scheduled functions on a real setTimeout; faking it keeps
// the push waiting until a test runs it.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  jira = inMemoryJira();
  team = jira.site("team", { issues: { "PROJ-1": "Login form" } });
  other = jira.site("other", { issues: { "PROJ-1": "Another team's login form" } });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const as = (t: T, subject: string) => t.withIdentity({ subject });

/** A person signed in as `subject`, in the room. */
async function seat(t: T, roomId: Id<"rooms">, subject: string): Promise<Id<"users">> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { authUserId: subject, name: subject, createdAt: Date.now() });
    await ctx.db.insert("roomMemberships", { roomId, userId, isSpectator: false, joinedAt: Date.now() });
    return userId;
  });
}

interface RoomSetup {
  /** The room's deck; Fibonacci when not given. */
  votingScale?: Doc<"rooms">["votingScale"];
  /** The site the issue was imported from; the team's when not given, null for a typed issue. */
  importedFrom?: FakeSite | null;
  mapping?: Partial<Pick<Doc<"integrationMappings">, "autoPushEstimates" | "storyPointsFieldId">> | null;
}

/**
 * A poker room with Ann and Bob in it, Ann connected to the team's Jira site
 * and the room mapped to PROJ through her connection, pushing estimates to
 * story points; and an issue, PROJ-1, imported from a site.
 */
async function seedRoom(t: T, setup: RoomSetup = {}) {
  const roomId = await t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "Sprint 12",
      roomType: "canvas",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
      ...(setup.votingScale ? { votingScale: setup.votingScale } : {}),
    })
  );
  const annId = await seat(t, roomId, "ann");
  await seat(t, roomId, "bob");
  const connectionId = await jira.connect(t, annId, team);
  const site = setup.importedFrom === undefined ? team : setup.importedFrom;
  const issueId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("issues", {
      roomId,
      sequentialId: 1,
      title: "PROJ-1 - Login form",
      status: "pending",
      createdAt: Date.now(),
      order: 1,
    });
    if (site) {
      await ctx.db.insert("issueLinks", {
        issueId: id,
        roomId,
        provider: "jira",
        externalId: "PROJ-1",
        externalUrl: `${site.url}/browse/PROJ-1`,
        lastSyncedAt: Date.now(),
      });
    }
    return id;
  });
  const mappingId =
    setup.mapping === null
      ? null
      : await t.run((ctx) =>
          ctx.db.insert("integrationMappings", {
            roomId,
            connectionId,
            provider: "jira",
            jiraProjectKey: "PROJ",
            storyPointsFieldId: "customfield_10016",
            autoImport: false,
            autoPushEstimates: true,
            createdAt: Date.now(),
            ...setup.mapping,
          })
        );
  return { roomId, issueId, connectionId, mappingId };
}

/** Ann starts a round on the issue, both vote `card`, Ann reveals, and every job that schedules runs. */
async function voteAndReveal(t: T, roomId: Id<"rooms">, issueId: Id<"issues">, card: string) {
  await as(t, "ann").mutation(api.issues.startVoting, { roomId, issueId });
  await as(t, "ann").mutation(api.votes.pickCard, { roomId, cardLabel: card });
  await as(t, "bob").mutation(api.votes.pickCard, { roomId, cardLabel: card });
  await as(t, "ann").mutation(api.rooms.showCards, { roomId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

const lastPushOf = async (t: T, mappingId: Id<"integrationMappings"> | null) =>
  mappingId && (await t.run((ctx) => ctx.db.get("integrationMappings", mappingId)))?.lastPush;

async function scheduledPushes(t: T) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((job) => job.name.endsWith(":pushEstimate"));
}

describe("an estimate settled on a linked issue", () => {
  it("goes to the issue on the mapping connection's site, as that connection, and the mapping records it", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId, connectionId, mappingId } = await seedRoom(t);

    await voteAndReveal(t, roomId, issueId, "5");

    expect(team.issues.get("PROJ-1")).toMatchObject({
      fields: { customfield_10016: 5 },
      comments: ["Estimated at 5 points via AgileKit"],
    });
    expect(jira.restCalls().map(({ method, site, path, token }) => ({ method, site, path, token }))).toEqual([
      { method: "PUT", site: team.url, path: "/rest/api/3/issue/PROJ-1", token: jira.tokenOf(connectionId) },
      { method: "POST", site: team.url, path: "/rest/api/3/issue/PROJ-1/comment", token: jira.tokenOf(connectionId) },
    ]);
    expect(await lastPushOf(t, mappingId)).toEqual({
      at: expect.any(Number),
      issueKey: "PROJ-1",
      estimate: "5",
      outcome: "pushed",
    });
  });

  it("isn't pushed or recorded when the mapping doesn't push estimates", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId, mappingId } = await seedRoom(t, { mapping: { autoPushEstimates: false } });

    await voteAndReveal(t, roomId, issueId, "5");

    expect(await scheduledPushes(t)).toEqual([]);
    expect(await lastPushOf(t, mappingId)).toBeUndefined();
    expect(jira.calls).toEqual([]);
  });

  it("isn't pushed when the mapping names no field to write it to, and the mapping says so", async () => {
    const t = withComponents(convexTest(schema, modules));
    // Saved before a mapping that pushes estimates had to name its field.
    const { roomId, issueId, mappingId } = await seedRoom(t, { mapping: { storyPointsFieldId: undefined } });

    await voteAndReveal(t, roomId, issueId, "5");

    expect(await scheduledPushes(t)).toEqual([]);
    expect(await lastPushOf(t, mappingId)).toMatchObject({ issueKey: "PROJ-1", estimate: "5", outcome: "noField" });
    expect(jira.calls).toEqual([]);
  });

  it("isn't pushed when it isn't a number, and the mapping says so", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId, mappingId } = await seedRoom(t, {
      votingScale: { type: "tshirt", cards: ["XS", "S", "M", "L", "XL", "XXL", "?", "☕"], isNumeric: false },
    });

    await voteAndReveal(t, roomId, issueId, "XL");

    expect(await scheduledPushes(t)).toEqual([]);
    expect(await lastPushOf(t, mappingId)).toMatchObject({ issueKey: "PROJ-1", estimate: "XL", outcome: "notANumber" });
    expect(jira.calls).toEqual([]);
  });

  it("isn't pushed to the same key on the connection's site when the issue came from another, and the mapping says so", async () => {
    const t = withComponents(convexTest(schema, modules));
    // Bob imported PROJ-1 from his own site; the room pushes through Ann's.
    const { roomId, issueId, mappingId } = await seedRoom(t, { importedFrom: other });

    await voteAndReveal(t, roomId, issueId, "5");

    expect(await scheduledPushes(t)).toEqual([]);
    expect(await lastPushOf(t, mappingId)).toMatchObject({ issueKey: "PROJ-1", outcome: "otherSite" });
    expect(team.issues.get("PROJ-1")).toMatchObject({ fields: {}, comments: [] });
    expect(other.issues.get("PROJ-1")).toMatchObject({ fields: {}, comments: [] });
    expect(jira.calls).toEqual([]);
  });

  it("isn't pushed when the connection has moved to another site by the time the push runs", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId, connectionId, mappingId } = await seedRoom(t);
    await as(t, "ann").mutation(api.issues.startVoting, { roomId, issueId });
    await as(t, "ann").mutation(api.votes.pickCard, { roomId, cardLabel: "5" });
    await as(t, "bob").mutation(api.votes.pickCard, { roomId, cardLabel: "5" });
    await as(t, "ann").mutation(api.rooms.showCards, { roomId });
    // Ann reconnects to another site before the push runs.
    await t.run((ctx) =>
      ctx.db.patch("integrationConnections", connectionId, { siteUrl: other.url, cloudId: other.cloudId })
    );

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await lastPushOf(t, mappingId)).toMatchObject({ outcome: "otherSite" });
    expect(other.issues.get("PROJ-1")).toMatchObject({ fields: {}, comments: [] });
    expect(jira.restCalls()).toEqual([]);
  });

  it("is recorded as refused, in Jira's words, when Jira won't take it", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId, mappingId } = await seedRoom(t);
    jira.refuseNext("PUT", "/rest/api/3/issue/PROJ-1", 400);

    await voteAndReveal(t, roomId, issueId, "5");

    const lastPush = await lastPushOf(t, mappingId);
    expect(lastPush).toMatchObject({ outcome: "refused" });
    expect(lastPush?.message).toContain("400");
    expect(team.issues.get("PROJ-1")?.comments).toEqual([]);
  });

  it("is recorded as pushed when Jira takes the estimate but not the comment saying so", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId, mappingId } = await seedRoom(t);
    // A project whose permissions allow editing issues, not commenting on them.
    jira.refuseNext("POST", "/rest/api/3/issue/PROJ-1/comment", 403);

    await voteAndReveal(t, roomId, issueId, "5");

    expect(team.issues.get("PROJ-1")).toMatchObject({ fields: { customfield_10016: 5 }, comments: [] });
    expect(await lastPushOf(t, mappingId)).toMatchObject({ outcome: "pushed" });
  });

  it("is recorded as unusable when the mapping's connection can't act", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId, connectionId, mappingId } = await seedRoom(t);
    await t.run((ctx) => ctx.db.patch("integrationConnections", connectionId, { expiresAt: Date.now() - 1_000 }));
    jira.revoke(connectionId);

    await voteAndReveal(t, roomId, issueId, "5");

    expect(await lastPushOf(t, mappingId)).toMatchObject({ outcome: "connectionUnusable" });
    expect(jira.restCalls()).toEqual([]);
  });

  it("goes nowhere, and nothing is recorded, for an issue typed in the room", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId, mappingId } = await seedRoom(t, { importedFrom: null });

    await voteAndReveal(t, roomId, issueId, "5");

    expect(await scheduledPushes(t)).toEqual([]);
    expect(await lastPushOf(t, mappingId)).toBeUndefined();
  });

  it("is pushed once, though a second reveal comes", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId } = await seedRoom(t);

    await voteAndReveal(t, roomId, issueId, "5");
    await as(t, "bob").mutation(api.rooms.showCards, { roomId }); // a second click
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(team.issues.get("PROJ-1")?.comments).toHaveLength(1);
    expect(await scheduledPushes(t)).toHaveLength(1);
  });
});

describe("a push a reveal queued before the estimate push decided pushes", () => {
  it("is decided now, as a reveal decides it", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { issueId, mappingId } = await seedRoom(t);

    // What a reveal scheduled before: the issue and the estimate.
    await t.action(internal.integrations.jira.pushEstimateToJira, { issueId, finalEstimate: "8" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(team.issues.get("PROJ-1")?.fields).toEqual({ customfield_10016: 8 });
    expect(await lastPushOf(t, mappingId)).toMatchObject({ estimate: "8", outcome: "pushed" });
  });
});

describe("the recorded outcome", () => {
  it("keeps the later estimate's, whichever push reports back last", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { mappingId } = await seedRoom(t);
    const later = { at: 2_000, issueKey: "PROJ-2", estimate: "3", outcome: "pushed" as const };
    const earlier = { at: 1_000, issueKey: "PROJ-1", estimate: "5", outcome: "refused" as const, message: "late" };

    await t.run((ctx) => EstimatePush.recordPush(ctx, mappingId!, later));
    await t.run((ctx) => EstimatePush.recordPush(ctx, mappingId!, earlier));

    expect(await lastPushOf(t, mappingId)).toEqual(later);
  });
});

describe("saving the room's mapping", () => {
  const mappingArgs = (roomId: Id<"rooms">, connectionId: Id<"integrationConnections">) => ({
    roomId,
    connectionId,
    provider: "jira" as const,
    jiraProjectKey: "PROJ",
    autoImport: false,
  });

  it("refuses one that pushes estimates without naming the field they go to, saying why", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, connectionId } = await seedRoom(t, { mapping: null });

    await expect(
      as(t, "ann").mutation(api.integrations.saveRoomMapping, { ...mappingArgs(roomId, connectionId), autoPushEstimates: true })
    ).rejects.toMatchObject({
      data: { code: "forbidden", message: "Choose the story points field estimates are pushed to, or turn auto-push off." },
    });
    await as(t, "ann").mutation(api.integrations.saveRoomMapping, {
      ...mappingArgs(roomId, connectionId),
      autoPushEstimates: false,
    });
    await as(t, "ann").mutation(api.integrations.saveRoomMapping, {
      ...mappingArgs(roomId, connectionId),
      autoPushEstimates: true,
      storyPointsFieldId: "customfield_10016",
    });
  });

  it("lets the last outcome go once what decides a push changes, and keeps it otherwise", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId, connectionId, mappingId } = await seedRoom(t, { mapping: { storyPointsFieldId: undefined } });
    await voteAndReveal(t, roomId, issueId, "5");
    expect(await lastPushOf(t, mappingId)).toMatchObject({ outcome: "noField" });
    const save = (storyPointsFieldId: string) =>
      as(t, "ann").mutation(api.integrations.saveRoomMapping, {
        ...mappingArgs(roomId, connectionId),
        autoPushEstimates: true,
        storyPointsFieldId,
      });

    await save("customfield_10016");
    expect(await lastPushOf(t, mappingId)).toBeUndefined();

    await t.run((ctx) =>
      EstimatePush.recordPush(ctx, mappingId!, { at: Date.now(), issueKey: "PROJ-1", estimate: "5", outcome: "pushed" })
    );
    await save("customfield_10016"); // the same settings again
    expect(await lastPushOf(t, mappingId)).toMatchObject({ outcome: "pushed" });
  });

  it("doesn't bring back, from a push still on its way, an outcome a save let go", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, issueId, connectionId, mappingId } = await seedRoom(t);
    await as(t, "ann").mutation(api.issues.startVoting, { roomId, issueId });
    await as(t, "ann").mutation(api.votes.pickCard, { roomId, cardLabel: "5" });
    await as(t, "bob").mutation(api.votes.pickCard, { roomId, cardLabel: "5" });
    await as(t, "ann").mutation(api.rooms.showCards, { roomId });
    // The field changes while the push to the old one is still waiting.
    await as(t, "ann").mutation(api.integrations.saveRoomMapping, {
      ...mappingArgs(roomId, connectionId),
      autoPushEstimates: true,
      storyPointsFieldId: "customfield_10020",
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(team.issues.get("PROJ-1")?.fields).toEqual({ customfield_10016: 5 });
    expect(await lastPushOf(t, mappingId)).toBeUndefined();
  });
});
