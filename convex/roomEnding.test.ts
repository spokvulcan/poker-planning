/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { withComponents } from "./components.setup";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import * as RoomEnding from "./model/roomEnding";
import { ROOM_TABLES } from "./model/roomEnding";
import * as Timer from "./model/timer";
import * as Canvas from "./model/canvas";
import { presence } from "./model/presence";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

// convex-test fires runAfter(0) on a real setTimeout; faking it keeps each
// step of an ending, and each page of the sweep, waiting until the test runs
// it.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

type CountedTable =
  | (typeof ROOM_TABLES)[number]
  | "rooms"
  | "users"
  | "integrationConnections"
  | "webhookEvents"
  | "gifSearchUsage";

async function countRows(t: T, table: CountedTable): Promise<number> {
  return t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
}

async function scheduledByName(t: T, suffix: string) {
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect()
  );
  return scheduled.filter((s) => s.name.endsWith(suffix));
}

/** The steps of room endings still waiting to run. */
async function pendingSteps(t: T) {
  return (await scheduledByName(t, ":deleteRoomAggregateChunk")).filter((job) => job.state.kind === "pending");
}

/**
 * Runs the jobs scheduled so far (under fake timers, a job waits for this),
 * and waits for them: one step of an ending, or one page of the sweep.
 */
async function nextStep(t: T): Promise<void> {
  vi.runOnlyPendingTimers();
  await t.finishInProgressScheduledFunctions();
}

/**
 * The webhooks handed to a job that removes them in Jira: one at a time
 * (first attempts only), or a disconnecting connection's all at once.
 */
async function webhookRemovals(t: T): Promise<string[]> {
  const single = (await scheduledByName(t, ":deregisterWebhook"))
    .map((job) => job.args[0] as { webhookId: string; attemptsLeft?: number })
    .filter((args) => args.attemptsLeft === undefined)
    .map((args) => args.webhookId);
  const together = (await scheduledByName(t, ":finalizeDisconnect")).flatMap(
    (job) => (job.args[0] as { webhookIds: string[] }).webhookIds
  );
  return [...single, ...together];
}

/**
 * Runs the room endings, the sweep's pages and the webhook removals, step by
 * step, until none is left waiting. A failed step fails the test.
 * (finishAllScheduledFunctions would chase presence's own heartbeat jobs
 * forever.)
 */
async function finishScheduled(t: T): Promise<void> {
  const ours = /:(deleteRoomAggregateChunk|endStaleRooms|deregisterWebhook|finalizeDisconnect)$/;
  for (let i = 0; i < 200; i++) {
    const jobs = (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).filter((job) =>
      ours.test(job.name)
    );
    expect(jobs.filter((job) => job.state.kind === "failed")).toEqual([]);
    if (!jobs.some((job) => job.state.kind === "pending")) return;
    await nextStep(t);
  }
  throw new Error("the endings and the sweep did not finish");
}

async function seedPerson(t: T): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", { authUserId: `auth-${crypto.randomUUID()}`, name: "U", createdAt: Date.now() })
  );
}

async function seedConnection(
  t: T,
  userId: Id<"users">
): Promise<Id<"integrationConnections">> {
  return t.run((ctx) =>
    ctx.db.insert("integrationConnections", {
      userId,
      provider: "jira",
      encryptedAccessToken: "enc-access",
      accessTokenIv: "iv",
      accessTokenAuthTag: "tag",
      expiresAt: Date.now() + 3_600_000,
      cloudId: "cloud-1",
      siteUrl: "https://team.atlassian.net",
      scopes: ["read:jira-work"],
      connectedAt: Date.now(),
      lastRefreshedAt: Date.now(),
    })
  );
}

async function seedMappingWithWebhook(
  t: T,
  roomId: Id<"rooms">,
  connectionId: Id<"integrationConnections">,
  jiraWebhookId: string
): Promise<Id<"integrationMappings">> {
  return t.run((ctx) =>
    ctx.db.insert("integrationMappings", {
      roomId,
      connectionId,
      provider: "jira",
      jiraProjectKey: "PROJ",
      jiraWebhookId,
      jiraWebhookRegisteredAt: Date.now(),
      autoImport: false,
      autoPushEstimates: true,
      createdAt: Date.now(),
    })
  );
}

async function seedRoom(t: T): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: true,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
    })
  );
}

/** A room nobody keeps, quiet for ten days. */
async function seedQuietRoom(t: T): Promise<Id<"rooms">> {
  const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "Quiet",
      autoCompleteVoting: true,
      isGameOver: false,
      createdAt: tenDaysAgo,
      lastActivityAt: tenDaysAgo,
      retained: false,
    })
  );
}

async function seedIssue(
  t: T,
  roomId: Id<"rooms">,
  sequentialId = 1
): Promise<Id<"issues">> {
  return t.run((ctx) =>
    ctx.db.insert("issues", {
      roomId,
      sequentialId,
      title: `Issue ${sequentialId}`,
      status: "pending",
      createdAt: Date.now(),
      order: sequentialId,
    })
  );
}

async function seedIssueLink(
  t: T,
  issueId: Id<"issues">
): Promise<Id<"issueLinks">> {
  return t.run((ctx) =>
    ctx.db.insert("issueLinks", {
      issueId,
      provider: "jira",
      externalId: `PROJ-${crypto.randomUUID()}`,
      externalUrl: "https://example.atlassian.net/browse/PROJ-1",
      lastSyncedAt: Date.now(),
    })
  );
}

/**
 * Seeds one room with one row in EVERY table of the inventory (plus the user
 * and integration connection those rows reference). A table new to the
 * inventory gets a row here, or the ending's first test fails.
 */
async function seedFullRoom(
  t: T
): Promise<{ roomId: Id<"rooms">; userId: Id<"users">; issueId: Id<"issues"> }> {
  return t.run(async (ctx) => {
    const roomId = await ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: true,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
    });
    const userId = await ctx.db.insert("users", {
      authUserId: `auth-${crypto.randomUUID()}`,
      name: "U",
      createdAt: Date.now(),
    });
    await ctx.db.insert("roomMemberships", {
      roomId,
      userId,
      isSpectator: false,
      joinedAt: Date.now(),
    });
    await ctx.db.insert("votes", {
      roomId,
      userId,
      cardLabel: "5",
      cardValue: 5,
    });
    const issueId = await ctx.db.insert("issues", {
      roomId,
      sequentialId: 1,
      title: "Issue 1",
      status: "voting",
      createdAt: Date.now(),
      order: 0,
    });
    await ctx.db.insert("canvasNodes", {
      roomId,
      nodeId: "session-current",
      type: "session",
      position: { x: 0, y: 0 },
      data: {},
      lastUpdatedAt: Date.now(),
    });
    await ctx.db.insert("votingTimestamps", {
      roomId,
      issueId,
      votingStartedAt: Date.now(),
      roundNumber: 1,
    });
    await ctx.db.insert("individualVotes", {
      roomId,
      issueId,
      userId,
      cardLabel: "5",
      votedAt: Date.now(),
    });
    await ctx.db.insert("roomAnalyticsSnapshots", {
      roomId,
      history: {
        completedIssues: [
          {
            title: "Issue 1",
            votedAt: Date.now(),
            finalEstimate: "5",
            voteStats: { agreement: 100 },
          },
        ],
        individualVotes: [{ userId, cardLabel: "5", votedAt: Date.now() }],
      },
      computedAt: Date.now(),
    });
    const connectionId = await ctx.db.insert("integrationConnections", {
      userId,
      provider: "jira",
      encryptedAccessToken: "token",
      accessTokenIv: "iv",
      accessTokenAuthTag: "tag",
      expiresAt: Date.now(),
      scopes: [],
      connectedAt: Date.now(),
      lastRefreshedAt: Date.now(),
    });
    await ctx.db.insert("integrationMappings", {
      roomId,
      connectionId,
      provider: "jira",
      autoImport: false,
      autoPushEstimates: false,
      createdAt: Date.now(),
    });
    await ctx.db.insert("issueLinks", {
      issueId,
      provider: "jira",
      externalId: "PROJ-1",
      externalUrl: "https://example.atlassian.net/browse/PROJ-1",
      lastSyncedAt: Date.now(),
    });
    await seedRetroRows(ctx, roomId, userId);
    return { roomId, userId, issueId };
  });
}

/**
 * One row in each of the retro tables, so the ending's tests prove it empties
 * them and the sweep's prove it never reads them.
 */
async function seedRetroRows(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">
): Promise<void> {
  const now = Date.now();
  const stickyId = await ctx.db.insert("retroStickies", {
    roomId,
    clientId: crypto.randomUUID(),
    columnId: "c1",
    text: "sticky",
    authorId: userId,
    position: { x: 0, y: 0 },
    createdAt: now,
  });
  await ctx.db.insert("retroStickyVotes", { roomId, stickyId, voterId: userId });
  await ctx.db.insert("retroActionItems", {
    roomId,
    text: "do it",
    done: false,
    createdAt: now,
  });
}

describe("the room inventory", () => {
  it("lists every table keyed by a room, so a new one can't outlive its room", () => {
    const keyedByRoom = Object.entries(schema.tables)
      .filter(([, table]) => "roomId" in (table as unknown as { validator: { fields: object } }).validator.fields)
      .map(([name]) => name);

    expect([...ROOM_TABLES].sort()).toEqual(keyedByRoom.sort());
  });
});

describe("ending a room", () => {
  it("deletes the room and everything it owns, a step at a time, until nothing is left", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await seedFullRoom(t);
    // A row in every table of the inventory, so none is empty by default.
    for (const table of ROOM_TABLES) {
      expect(await countRows(t, table), table).toBeGreaterThan(0);
    }

    await t.run((ctx) => RoomEnding.endRoom(ctx, roomId));
    await finishScheduled(t);

    expect(await countRows(t, "rooms")).toBe(0);
    for (const table of ROOM_TABLES) {
      expect(await countRows(t, table), table).toBe(0);
    }
    // The integration connection is a person's, not the room's: it survives.
    expect(await countRows(t, "integrationConnections")).toBe(1);
  });

  it("hands each mapping's webhook to its provider's reconcile, and keeps the connection that removes it", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedRoom(t);
    const connectionId = await seedConnection(t, await seedPerson(t));
    await seedMappingWithWebhook(t, roomId, connectionId, "wh-room");

    await t.run((ctx) => RoomEnding.endRoom(ctx, roomId));
    await nextStep(t);

    expect(await countRows(t, "integrationMappings")).toBe(0);
    expect(await countRows(t, "rooms")).toBe(0);
    // Deleting the mapping alone would leave its webhook live in Jira. Its
    // removal is scheduled with the connection that made it, which outlives
    // the room so the removal can authenticate.
    expect((await scheduledByName(t, ":deregisterWebhook")).map((job) => job.args[0])).toEqual([
      { connectionId, webhookId: "wh-room" },
    ]);
    expect(await countRows(t, "integrationConnections")).toBe(1);
  });

  it("clears the room's presence, which lives in its component, and leaves other rooms' alone", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedRoom(t);
    const otherRoomId = await seedRoom(t);
    await t.run(async (ctx) => {
      await presence.heartbeat(ctx, roomId, "u1", "s1", 10_000);
      await presence.heartbeat(ctx, roomId, "u2", "s2", 10_000);
      await presence.heartbeat(ctx, otherRoomId, "u1", "s3", 10_000);
    });

    await t.run((ctx) => RoomEnding.endRoom(ctx, roomId));
    await nextStep(t);

    expect(await countRows(t, "rooms")).toBe(1);
    expect(await t.run((ctx) => presence.listRoom(ctx, roomId))).toEqual([]);
    expect(await t.run((ctx) => presence.listRoom(ctx, otherRoomId))).toEqual([
      expect.objectContaining({ userId: "u1" }),
    ]);
  });

  it("goes in steps: the issues with their links first, a batch at a time, and the room row last", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedRoom(t);
    for (const sequentialId of [1, 2, 3]) {
      await seedIssueLink(t, await seedIssue(t, roomId, sequentialId));
    }
    const userId = await seedPerson(t);
    await t.run((ctx) => ctx.db.insert("roomMemberships", { roomId, userId, isSpectator: false, joinedAt: Date.now() }));

    // A batch of one: each step takes one issue and its link, and the ending
    // schedules the next step itself.
    expect(await t.mutation(internal.maintenance.deleteRoomAggregateChunk, { roomId, batchSize: 1 })).toEqual({
      done: false,
    });
    for (const issuesLeft of [2, 1, 0]) {
      expect(await countRows(t, "issues")).toBe(issuesLeft);
      expect(await countRows(t, "issueLinks")).toBe(issuesLeft);
      // The other tables wait for the issues, and the room row for every table.
      expect(await countRows(t, "roomMemberships")).toBe(1);
      expect(await countRows(t, "rooms")).toBe(1);
      await nextStep(t);
    }
    expect(await countRows(t, "roomMemberships")).toBe(0);
    expect(await countRows(t, "rooms")).toBe(1);

    await nextStep(t);
    expect(await countRows(t, "rooms")).toBe(0);
    expect(await pendingSteps(t)).toEqual([]);
  });

  it("takes the links its issues left behind when they went before them", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedRoom(t);
    const issueId = await seedIssue(t, roomId);
    await t.run(async (ctx) => {
      await ctx.db.insert("issueLinks", {
        issueId,
        roomId,
        provider: "jira",
        externalId: "PROJ-7",
        externalUrl: "https://example.atlassian.net/browse/PROJ-7",
        lastSyncedAt: Date.now(),
      });
      await ctx.db.delete("issues", issueId);
    });

    await t.run((ctx) => RoomEnding.endRoom(ctx, roomId));
    await finishScheduled(t);

    expect(await countRows(t, "rooms")).toBe(0);
    expect(await countRows(t, "issueLinks")).toBe(0);
  });

  it("finishes the ending of a room whose row is already gone", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await seedFullRoom(t);
    await t.run(async (ctx) => {
      await presence.heartbeat(ctx, roomId, "u1", "s1", 10_000);
      await ctx.db.delete("rooms", roomId);
    });

    await t.run((ctx) => RoomEnding.endRoom(ctx, roomId));
    await finishScheduled(t);

    for (const table of ROOM_TABLES) {
      expect(await countRows(t, table), table).toBe(0);
    }
    expect(await t.run((ctx) => presence.listRoom(ctx, roomId))).toEqual([]);
  });
});

describe("the sweep", () => {
  it("ends each room nobody keeps after five quiet days, and leaves active rooms alone", async () => {
    const t = withComponents(convexTest(schema, modules));
    const quietId = await seedQuietRoom(t);
    const activeId = await seedRoom(t);

    expect(await t.mutation(internal.maintenance.endStaleRooms, {})).toMatchObject({ roomsEnding: 1 });

    // Nothing goes in the sweep's own transaction: each room ends in steps of
    // its own, so one oversized room can't blow the sweep's limits or take
    // the other rooms down with it.
    expect(await countRows(t, "rooms")).toBe(2);
    expect((await pendingSteps(t)).map((job) => job.args[0].roomId)).toEqual([quietId]);
    await finishScheduled(t);
    expect(await t.run((ctx) => ctx.db.get("rooms", quietId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get("rooms", activeId))).not.toBeNull();
  });

  it("goes on past a full page until every quiet room is ending", async () => {
    const t = withComponents(convexTest(schema, modules));
    for (let i = 0; i < 3; i++) await seedQuietRoom(t);

    // A page of one room: the sweep ends one, then carries on by itself.
    expect(await t.mutation(internal.maintenance.endStaleRooms, { batchSize: 1 })).toEqual({ roomsEnding: 1, done: false });
    await finishScheduled(t);

    expect(await countRows(t, "rooms")).toBe(0);
  });

  it("leaves a room with recent timer-only activity alone", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedQuietRoom(t);
    const userId = await seedPerson(t);
    await t.run((ctx) =>
      ctx.db.insert("canvasNodes", {
        roomId,
        nodeId: "timer",
        type: "timer",
        position: { x: 0, y: 0 },
        data: {
          startedAt: null,
          pausedAt: null,
          elapsedSeconds: 0,
          lastAction: null,
        },
        lastUpdatedAt: Date.now(),
      })
    );

    // The room's only sign of life in days is a timer start — that must count
    // as activity or the sweep ends a room in use.
    await t.run((ctx) =>
      Timer.updateTimerState(ctx, { roomId, nodeId: "timer", action: "start", userId })
    );

    expect(await t.mutation(internal.maintenance.endStaleRooms, {})).toMatchObject({ roomsEnding: 0 });
    await finishScheduled(t);
    expect(await t.run((ctx) => ctx.db.get("rooms", roomId))).not.toBeNull();
  });

  it("leaves a room with recent canvas-only activity alone", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedQuietRoom(t);
    const userId = await seedPerson(t);
    await t.run((ctx) =>
      ctx.db.insert("canvasNodes", {
        roomId,
        nodeId: "session-current",
        type: "session",
        position: { x: 0, y: 0 },
        data: {},
        lastUpdatedAt: Date.now(),
      })
    );

    // Only a canvas node move — no votes, no issues — keeps the room alive.
    await t.run(async (ctx) =>
      Canvas.moveNodes(ctx, (await ctx.db.get("rooms", roomId))!, [
        { nodeId: "session-current", position: { x: 10, y: 20 } },
      ], userId)
    );

    expect(await t.mutation(internal.maintenance.endStaleRooms, {})).toMatchObject({ roomsEnding: 0 });
    await finishScheduled(t);
    expect(await t.run((ctx) => ctx.db.get("rooms", roomId))).not.toBeNull();
  });

  it("finishes ending a room deleted some other way: its rows, its mapping's webhook and its presence go", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, userId } = await seedFullRoom(t);
    const connectionId = await seedConnection(t, userId);
    await seedMappingWithWebhook(t, roomId, connectionId, "wh-orphan");
    await t.run(async (ctx) => {
      await presence.heartbeat(ctx, roomId, "u1", "s1", 10_000);
      // Deleted by hand, out from under its ending.
      await ctx.db.delete("rooms", roomId);
    });

    await t.mutation(internal.maintenance.endStaleRooms, {});
    await finishScheduled(t);

    for (const table of ROOM_TABLES) {
      expect(await countRows(t, table), table).toBe(0);
    }
    expect((await scheduledByName(t, ":deregisterWebhook")).map((job) => job.args[0])).toContainEqual({
      connectionId,
      webhookId: "wh-orphan",
    });
    expect(await t.run((ctx) => presence.listRoom(ctx, roomId))).toEqual([]);
  });

  it("never reads the retro's tables: the retro rows of a room that left nothing else behind stay", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedRoom(t);
    const userId = await seedPerson(t);
    await t.run(async (ctx) => {
      await seedRetroRows(ctx, roomId, userId);
      await ctx.db.delete("rooms", roomId);
    });

    await t.mutation(internal.maintenance.endStaleRooms, {});
    await finishScheduled(t);

    // They may hold retained data, and reading all of them every day is not
    // worth its cost (ADR-0016): the sweep finds a retro through its other rows.
    for (const table of ["retroStickies", "retroStickyVotes", "retroActionItems"] as const) {
      expect(await countRows(t, table), table).toBe(1);
    }
  });

  it("drops the links an issue left behind when it went before them, and keeps the rest", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedRoom(t);
    const keptIssueId = await seedIssue(t, roomId, 1);
    const goneIssueId = await seedIssue(t, roomId, 2);
    await seedIssueLink(t, keptIssueId);
    await seedIssueLink(t, goneIssueId);
    await t.run((ctx) => ctx.db.delete("issues", goneIssueId));

    await t.mutation(internal.maintenance.endStaleRooms, {});
    await finishScheduled(t);

    expect(await countRows(t, "rooms")).toBe(1);
    expect(await countRows(t, "issues")).toBe(1);
    expect((await t.run((ctx) => ctx.db.query("issueLinks").collect())).map((link) => link.issueId)).toEqual([
      keptIssueId,
    ]);
  });

  it("reads a page per transaction, so it gets through more than one transaction may read", async () => {
    const t = withComponents(convexTest({ schema, modules, transactionLimits: { documentsRead: 30 } }));
    // Forty rooms deleted by hand, each leaving a membership behind.
    for (let i = 0; i < 40; i++) {
      const roomId = await seedRoom(t);
      const userId = await seedPerson(t);
      await t.run(async (ctx) => {
        await ctx.db.insert("roomMemberships", { roomId, userId, isSpectator: false, joinedAt: Date.now() });
        await ctx.db.delete("rooms", roomId);
      });
    }

    await t.mutation(internal.maintenance.endStaleRooms, { batchSize: 10 });
    // Reading the scheduler's own table would read past the limit too, so
    // run whatever is waiting until nothing is.
    for (let i = 0; i < 100 && vi.getTimerCount() > 0; i++) await nextStep(t);

    expect(await countRows(t, "roomMemberships")).toBe(0);
  });
});

describe("the admin wipe", () => {
  it("ends every room the way any room ends, removing its webhooks and presence, and empties every table", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId, userId } = await seedFullRoom(t);
    const mappedRoomId = await seedRoom(t);
    const connectionId = await seedConnection(t, userId);
    await seedMappingWithWebhook(t, mappedRoomId, connectionId, "wh-wiped");
    await t.run(async (ctx) => {
      await presence.heartbeat(ctx, roomId, "u1", "s1", 10_000);
      await ctx.db.insert("webhookEvents", { eventKey: "evt-1", provider: "jira", processedAt: Date.now() });
      await ctx.db.insert("gifSearchUsage", { hour: 0, requests: 3, rateLimited: 0 });
    });

    await t.mutation(internal.admin.dangerouslyDeleteAllData, {
      confirm: "I understand this will delete all data permanently",
    });

    // Each room ends through the room ending, in steps of its own…
    expect(new Set((await pendingSteps(t)).map((job) => job.args[0].roomId))).toEqual(new Set([roomId, mappedRoomId]));
    // …and the webhook is removed with the connection that made it, before
    // that connection goes.
    expect(await webhookRemovals(t)).toEqual(["wh-wiped"]);
    await finishScheduled(t);

    for (const table of [...ROOM_TABLES, "rooms", "users", "integrationConnections", "webhookEvents", "gifSearchUsage"] as const) {
      expect(await countRows(t, table), table).toBe(0);
    }
    expect(await t.run((ctx) => presence.listRoom(ctx, roomId))).toEqual([]);
  });

  it("also takes what a room deleted some other way left behind, and links whose issue went first", async () => {
    const t = withComponents(convexTest(schema, modules));
    const { roomId } = await seedFullRoom(t);
    await t.run(async (ctx) => {
      await presence.heartbeat(ctx, roomId, "u1", "s1", 10_000);
      await ctx.db.delete("rooms", roomId);
    });
    const liveRoomId = await seedRoom(t);
    const goneIssueId = await seedIssue(t, liveRoomId);
    await seedIssueLink(t, goneIssueId);
    await t.run((ctx) => ctx.db.delete("issues", goneIssueId));

    await t.mutation(internal.admin.dangerouslyDeleteAllData, {
      confirm: "I understand this will delete all data permanently",
    });
    await finishScheduled(t);

    for (const table of [...ROOM_TABLES, "rooms", "users", "integrationConnections"] as const) {
      expect(await countRows(t, table), table).toBe(0);
    }
    expect(await t.run((ctx) => presence.listRoom(ctx, roomId))).toEqual([]);
  });
});
