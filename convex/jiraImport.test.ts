/// <reference types="vite/client" />
/**
 * The Jira import seam: the adapter turns each selected key into a title and
 * a link and hands it to the issue module's admission, reporting every key it
 * could not import and why. Covered through importIssuesWithClient with a fake
 * Jira client; admission is the real one, through the adapter's registered
 * mutation. The registered action is only the auth preamble around it.
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { importIssuesWithClient } from "./integrations/jira";
import type { JiraClient, JiraIssue } from "./integrations/jiraClient";
import { MAX_ISSUES_PER_ROOM } from "./constants";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

const SITE = "https://team.atlassian.net";

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

function importInto(
  t: T,
  roomId: Id<"rooms">,
  client: Pick<JiraClient, "getIssue">,
  keys: string[],
  connection: { siteUrl?: string } = { siteUrl: SITE }
) {
  return importIssuesWithClient(
    client,
    (candidate) => t.mutation(internal.integrations.jira.admitIssue, { roomId, ...candidate }),
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
  it("imports each key as its Jira title, linked to its Jira page", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const { client } = fakeJira({ "PROJ-1": "Login form", "PROJ-2": "Signup" });

    const result = await importInto(t, roomId, client, ["PROJ-1", "PROJ-2"]);

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
    const { client } = fakeJira({ "PROJ-1": "Login form", "PROJ-2": "Signup" });
    await importInto(t, roomId, client, ["PROJ-1"]);

    const result = await importInto(t, roomId, client, ["PROJ-1", "PROJ-2"]);

    expect(result).toEqual({ imported: 1, skipped: 1, refused: [] });
  });

  it("refuses every key when the room is full, saying why", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await fillRoom(t, roomId);
    const { client } = fakeJira({ "PROJ-1": "Login form", "PROJ-2": "Signup" });

    const result = await importInto(t, roomId, client, ["PROJ-1", "PROJ-2"]);

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
    const { client } = fakeJira({ "PROJ-1": "Login form" });

    const result = await importInto(t, roomId, client, ["PROJ-404", "PROJ-1"]);

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
    const { client, asked } = fakeJira({ "PROJ-1": "Login form" });

    const result = await importInto(t, roomId, client, ["PROJ-1"], {});

    expect(result).toEqual({
      imported: 0,
      skipped: 0,
      refused: [{ key: "PROJ-1", reason: "Your Jira connection has no site address; reconnect Jira" }],
    });
    expect(asked).toEqual([]);
    expect(await roomIssueTitles(t, roomId)).toEqual([]);
  });
});
