/// <reference types="vite/client" />
/**
 * The Jira import: a room write, so it takes the room-scoped step under its
 * caller's own identity (the mutations an action runs run as its caller),
 * once before Jira is called and again for each issue it admits. The adapter
 * turns each selected key into a title and a link and hands it to the issue
 * module's admission, reporting every key it could not import and why.
 * Covered through importIssuesWithClient with a fake Jira client, each
 * admission the real one through the adapter's registered mutation, run as
 * the importer; and through the registered action for the refusals that come
 * before Jira is asked anything.
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { importIssuesWithClient } from "./integrations/jira";
import type { JiraClient, JiraIssue } from "./integrations/jiraClient";
import { MAX_ISSUES_PER_ROOM } from "./constants";
import { DEFAULT_PERMISSIONS } from "./permissions";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

const SITE = "https://team.atlassian.net";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

/** A person signed in as `subject`, with a users row. */
async function seedPerson(t: T, subject: string): Promise<Id<"users">> {
  return t.run((ctx) => ctx.db.insert("users", { authUserId: subject, name: subject, createdAt: Date.now() }));
}

/** A person with a seat in the room, as a participant. */
async function seatIn(t: T, roomId: Id<"rooms">, subject: string): Promise<Id<"users">> {
  const userId = await seedPerson(t, subject);
  await t.run((ctx) => ctx.db.insert("roomMemberships", { roomId, userId, isSpectator: false, joinedAt: Date.now() }));
  return userId;
}

/** Only facilitators and the owner may manage the room's issues from now on. */
async function onlyFacilitatorsManageIssues(t: T, roomId: Id<"rooms">): Promise<void> {
  await t.run((ctx) =>
    ctx.db.patch("rooms", roomId, { permissions: { ...DEFAULT_PERMISSIONS, issueManagement: "facilitators" } })
  );
}

async function fillRoom(t: T, roomId: Id<"rooms">): Promise<void> {
  for (let start = 1; start <= MAX_ISSUES_PER_ROOM; start += 100) {
    await t.run(async (ctx) => {
      for (let n = start; n < start + 100; n++) {
        await ctx.db.insert("issues", {
          roomId,
          sequentialId: n,
          title: `Issue ${n}`,
          status: "pending",
          createdAt: Date.now(),
          order: n,
        });
      }
    });
  }
}

/** A Jira that knows the given keys and answers 404 for any other. */
function fakeJira(known: Record<string, string>) {
  const asked: string[] = [];
  const client: Pick<JiraClient, "getIssue"> = {
    async getIssue(key: string): Promise<JiraIssue> {
      asked.push(key);
      const summary = known[key];
      if (summary === undefined) {
        throw new Error(`Jira API GET /rest/api/3/issue/${key} failed: 404 Issue does not exist`);
      }
      return {
        id: `id-${key}`,
        key,
        fields: { summary, issuetype: { name: "Story" }, status: { name: "To Do" } },
      };
    },
  };
  return { client, asked };
}

/** Imports the keys into the room as `subject`, each admission on the step as the action would run it. */
function importInto(
  t: T,
  roomId: Id<"rooms">,
  subject: string,
  client: Pick<JiraClient, "getIssue">,
  keys: string[],
  connection: { siteUrl?: string } = { siteUrl: SITE },
  afterEachAdmission: () => Promise<void> = async () => {}
) {
  const importer = t.withIdentity({ subject });
  return importIssuesWithClient(
    client,
    async (candidate) => {
      const admission = await importer.mutation(internal.integrations.jira.admitIssue, { roomId, ...candidate });
      await afterEachAdmission();
      return admission;
    },
    { keys, siteUrl: connection.siteUrl }
  );
}

async function roomIssueTitles(t: T, roomId: Id<"rooms">): Promise<string[]> {
  const issues = await t.run((ctx) =>
    ctx.db
      .query("issues")
      .withIndex("by_room_order", (q) => q.eq("roomId", roomId))
      .collect()
  );
  return issues.map((issue) => issue.title);
}

describe("Jira import", () => {
  it("imports each key as its Jira title, linked to its Jira page, counting each admission", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await seatIn(t, roomId, "auth-ann");
    const { client } = fakeJira({ "PROJ-1": "Login form", "PROJ-2": "Signup" });

    const result = await importInto(t, roomId, "auth-ann", client, ["PROJ-1", "PROJ-2"]);

    expect(result).toEqual({ imported: 2, skipped: 0, refused: [] });
    expect(await roomIssueTitles(t, roomId)).toEqual(["PROJ-1 - Login form", "PROJ-2 - Signup"]);
    const links = await t.run((ctx) => ctx.db.query("issueLinks").collect());
    expect(links.map((link) => link.externalUrl)).toEqual([
      "https://team.atlassian.net/browse/PROJ-1",
      "https://team.atlassian.net/browse/PROJ-2",
    ]);
  });

  it("counts a key already in the room as skipped", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await seatIn(t, roomId, "auth-ann");
    const { client } = fakeJira({ "PROJ-1": "Login form", "PROJ-2": "Signup" });
    await importInto(t, roomId, "auth-ann", client, ["PROJ-1"]);

    const result = await importInto(t, roomId, "auth-ann", client, ["PROJ-1", "PROJ-2"]);

    expect(result).toEqual({ imported: 1, skipped: 1, refused: [] });
  });

  it("refuses every key when the room is full, saying why", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await seatIn(t, roomId, "auth-ann");
    await fillRoom(t, roomId);
    const { client } = fakeJira({ "PROJ-1": "Login form", "PROJ-2": "Signup" });

    const result = await importInto(t, roomId, "auth-ann", client, ["PROJ-1", "PROJ-2"]);

    expect(result).toEqual({
      imported: 0,
      skipped: 0,
      refused: [
        { key: "PROJ-1", reason: "Rooms are limited to 500 issues" },
        { key: "PROJ-2", reason: "Rooms are limited to 500 issues" },
      ],
    });
  });

  it("refuses a key Jira doesn't return and imports the rest", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await seatIn(t, roomId, "auth-ann");
    const { client } = fakeJira({ "PROJ-1": "Login form" });

    const result = await importInto(t, roomId, "auth-ann", client, ["PROJ-404", "PROJ-1"]);

    expect(result).toEqual({
      imported: 1,
      skipped: 0,
      refused: [
        {
          key: "PROJ-404",
          reason: "Couldn't be read from Jira (deleted, or not visible to you)",
        },
      ],
    });
    expect(await roomIssueTitles(t, roomId)).toEqual(["PROJ-1 - Login form"]);
  });

  it("refuses every key when the Jira connection has no site, without asking Jira", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await seatIn(t, roomId, "auth-ann");
    const { client, asked } = fakeJira({ "PROJ-1": "Login form" });

    const result = await importInto(t, roomId, "auth-ann", client, ["PROJ-1"], {});

    expect(result).toEqual({
      imported: 0,
      skipped: 0,
      refused: [{ key: "PROJ-1", reason: "Your Jira connection has no site address; reconnect Jira" }],
    });
    expect(asked).toEqual([]);
    expect(await roomIssueTitles(t, roomId)).toEqual([]);
  });
});

describe("the import takes the room-scoped step", () => {
  /** Jira, standing by: any call to it fails the test. */
  function jiraUntouched() {
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("refuses someone outside the room before Jira is asked anything", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await seatIn(t, roomId, "auth-ann");
    await seedPerson(t, "auth-outsider");
    const fetch = jiraUntouched();

    await expect(
      t
        .withIdentity({ subject: "auth-outsider" })
        .action(api.integrations.jira.importIssues, { roomId, jiraIssueKeys: ["PROJ-1"] })
    ).rejects.toMatchObject({ data: { code: "forbidden", message: "Not a member of this room" } });
    expect(fetch).not.toHaveBeenCalled();
    expect(await roomIssueTitles(t, roomId)).toEqual([]);
  });

  it("refuses a participant who may not manage the room's issues, with the guard's message, before Jira is asked", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await seatIn(t, roomId, "auth-ann");
    await onlyFacilitatorsManageIssues(t, roomId);
    const fetch = jiraUntouched();

    await expect(
      t.withIdentity({ subject: "auth-ann" }).action(api.integrations.jira.importIssues, { roomId, jiraIssueKeys: ["PROJ-1"] })
    ).rejects.toMatchObject({ data: { code: "forbidden", message: "Only facilitators and the owner can do this." } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("admits each issue on the step: once the importer may no longer manage issues, the rest are refused, saying why", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await seatIn(t, roomId, "auth-ann");
    const { client } = fakeJira({ "PROJ-1": "Login form", "PROJ-2": "Signup" });

    // The owner narrows issue management while the import runs.
    const result = await importInto(t, roomId, "auth-ann", client, ["PROJ-1", "PROJ-2"], { siteUrl: SITE }, () =>
      onlyFacilitatorsManageIssues(t, roomId)
    );

    expect(result).toEqual({
      imported: 1,
      skipped: 0,
      refused: [{ key: "PROJ-2", reason: "Only facilitators and the owner can do this." }],
    });
    expect(await roomIssueTitles(t, roomId)).toEqual(["PROJ-1 - Login form"]);
  });

  it("admits nothing for a caller who isn't signed in", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    await expect(
      t.mutation(internal.integrations.jira.admitIssue, {
        roomId,
        title: "PROJ-1 - Login form",
        link: { provider: "jira", externalId: "PROJ-1", externalUrl: `${SITE}/browse/PROJ-1` },
      })
    ).rejects.toThrow("Not authenticated");
    expect(await roomIssueTitles(t, roomId)).toEqual([]);
  });
});
