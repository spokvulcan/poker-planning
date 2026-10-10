/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as Issues from "./model/issues";
import type { T } from "./analytics.seeds";
import { as, join, seedUser } from "./people.seeds";

// An issue's link to its tracker (model/issues.ts). A Jira issue can be
// imported into several rooms on purpose, so a change in Jira reaches that
// key's issue in every one of them, but never the same key on another Jira
// site; and a link leaves with its issue.

const modules = import.meta.glob("./**/*.*s");

/** A room "ann" opens and sits in. */
async function openRoom(t: T, name: string): Promise<Id<"rooms">> {
  const roomId = await as(t, "ann").mutation(api.rooms.create, { name });
  await join(t, roomId, "ann");
  return roomId;
}

/** The Jira site the rooms' issues come from, unless a test names another. */
const SITE = "https://team.atlassian.net";

/** Brings a Jira issue into the room the way an import hands it over: a title and a link. */
const importJiraIssue = (
  t: T,
  roomId: Id<"rooms">,
  key: string,
  summary = "Old summary",
  site = SITE
) =>
  t.mutation(internal.integrations.jira.admitIssue, {
    roomId,
    title: `${key} - ${summary}`,
    link: { provider: "jira", externalId: key, externalUrl: `${site}/browse/${key}` },
  });

let jiraTimestamp = 1_700_000_000_000;

/**
 * One Jira event about an issue, as the webhook boundary parses a delivery of
 * it from the site whose webhook delivered it.
 */
function jiraEvent(
  eventType: "jira:issue_updated" | "jira:issue_deleted",
  issueKey: string,
  issueSummary?: string,
  site = SITE
) {
  return {
    eventKey: `jira:${site}:10001:${jiraTimestamp++}`,
    eventType,
    site,
    issueKey,
    issueSummary,
  };
}

/** Processes one delivery of the event, as the webhook route does. */
const deliver = (t: T, event: ReturnType<typeof jiraEvent>) =>
  t.mutation(internal.integrations.jira.processJiraWebhook, event);

/** The room's issue titles, as its issue list shows them. */
const titles = async (t: T, roomId: Id<"rooms">) =>
  (await t.query(api.issues.list, { roomId })).map((issue) => issue.title);

/** The Jira keys the room's issues link to, as the room shows them. */
const linkedKeys = async (t: T, roomId: Id<"rooms">) =>
  Object.values(await as(t, "ann").query(api.integrations.getIssueLinks, { roomId }))
    .map((link) => link.externalId)
    .sort();

describe("a Jira issue renamed", () => {
  it("retitles that key's issue in every room, though each room's webhook delivers the rename", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "ann");
    const roomA = await openRoom(t, "Room A");
    const roomB = await openRoom(t, "Room B");
    await importJiraIssue(t, roomA, "PROJ-1");
    await importJiraIssue(t, roomB, "PROJ-1");

    // Each mapped room registered a webhook of its own, so Jira delivers the
    // one event once per room, under one event key.
    const rename = jiraEvent("jira:issue_updated", "PROJ-1", "New summary");
    await deliver(t, rename);
    await deliver(t, rename);

    expect(await titles(t, roomA)).toEqual(["PROJ-1 - New summary"]);
    expect(await titles(t, roomB)).toEqual(["PROJ-1 - New summary"]);
  });

  it("retitles the room's issue past a link its deleted issue left behind", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "ann");
    const roomId = await openRoom(t, "Room");
    // Deleting an issue used to leave its link for the daily sweep.
    const { issueId: deleted } = await importJiraIssue(t, roomId, "PROJ-1");
    await t.run((ctx) => ctx.db.delete("issues", deleted));
    await importJiraIssue(t, roomId, "PROJ-1");

    await deliver(t, jiraEvent("jira:issue_updated", "PROJ-1", "New summary"));

    expect(await titles(t, roomId)).toEqual(["PROJ-1 - New summary"]);
  });

  it("keeps the new title by the title rule, as a rename typed in the room is kept", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "ann");
    const roomId = await openRoom(t, "Room");
    await importJiraIssue(t, roomId, "PROJ-1");

    await deliver(t, jiraEvent("jira:issue_updated", "PROJ-1", "New summary   "));

    expect(await titles(t, roomId)).toEqual(["PROJ-1 - New summary"]);
  });

  it("leaves the room's activity clock alone when an update keeps the title", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "ann");
    const roomId = await openRoom(t, "Room");
    await importJiraIssue(t, roomId, "PROJ-1", "Summary");
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { lastActivityAt: 1_000_000 }));

    // Jira sends an update for any change to the issue: a comment, a status,
    // the estimate AgileKit pushed.
    await deliver(t, jiraEvent("jira:issue_updated", "PROJ-1", "Summary"));

    const room = await t.run((ctx) => ctx.db.get("rooms", roomId));
    expect(room?.lastActivityAt).toBe(1_000_000);
  });
});

describe("the same key on two Jira sites", () => {
  // Two teams on Jira sites of their own each have a SCRUM-1, in rooms of their own.
  const OTHER_SITE = "https://other-team.atlassian.net";

  it("retitles only the issue from the site the rename came from", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "ann");
    const ours = await openRoom(t, "Ours");
    const theirs = await openRoom(t, "Theirs");
    await importJiraIssue(t, ours, "SCRUM-1");
    await importJiraIssue(t, theirs, "SCRUM-1", "Old summary", OTHER_SITE);

    await deliver(t, jiraEvent("jira:issue_updated", "SCRUM-1", "New summary"));

    expect(await titles(t, ours)).toEqual(["SCRUM-1 - New summary"]);
    expect(await titles(t, theirs)).toEqual(["SCRUM-1 - Old summary"]);
  });

  it("unlinks only the issue from the site the deletion came from", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "ann");
    const ours = await openRoom(t, "Ours");
    const theirs = await openRoom(t, "Theirs");
    await importJiraIssue(t, ours, "SCRUM-1");
    await importJiraIssue(t, theirs, "SCRUM-1", "Old summary", OTHER_SITE);

    await deliver(t, jiraEvent("jira:issue_deleted", "SCRUM-1", undefined, OTHER_SITE));

    expect(await linkedKeys(t, ours)).toEqual(["SCRUM-1"]);
    expect(await linkedKeys(t, theirs)).toEqual([]);
  });

  it("leaves alone a link whose import knew no site, whichever site a change comes from", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "ann");
    const roomId = await openRoom(t, "Room");
    const { issueId } = await importJiraIssue(t, roomId, "SCRUM-1");
    // Imports by a connection without a site address once linked to "/browse/KEY".
    await t.run(async (ctx) => {
      const link = await ctx.db
        .query("issueLinks")
        .withIndex("by_issue", (q) => q.eq("issueId", issueId))
        .unique();
      await ctx.db.patch("issueLinks", link!._id, { externalUrl: "/browse/SCRUM-1" });
    });

    await deliver(t, jiraEvent("jira:issue_updated", "SCRUM-1", "New summary"));
    await deliver(t, jiraEvent("jira:issue_deleted", "SCRUM-1"));

    expect(await titles(t, roomId)).toEqual(["SCRUM-1 - Old summary"]);
    expect(await linkedKeys(t, roomId)).toEqual(["SCRUM-1"]);
  });
});

describe("following a tracker change (Issues.followTrackerChange)", () => {
  it("keeps the title when the tracker's title fits the title rule as nothing", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "ann");
    const roomId = await openRoom(t, "Room");
    await importJiraIssue(t, roomId, "PROJ-1");

    // Jira always sends "KEY - summary"; another tracker might send nothing.
    await t.run((ctx) =>
      Issues.followTrackerChange(
        ctx,
        { provider: "jira", externalId: "PROJ-1", externalUrl: `${SITE}/browse/PROJ-1` },
        { kind: "retitled", title: "   " }
      )
    );

    expect(await titles(t, roomId)).toEqual(["PROJ-1 - Old summary"]);
  });
});

describe("a Jira issue deleted", () => {
  it("unlinks that key's issue in every room and keeps the issues", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "ann");
    const roomA = await openRoom(t, "Room A");
    const roomB = await openRoom(t, "Room B");
    await importJiraIssue(t, roomA, "PROJ-1");
    await importJiraIssue(t, roomA, "PROJ-2");
    await importJiraIssue(t, roomB, "PROJ-1");

    await deliver(t, jiraEvent("jira:issue_deleted", "PROJ-1"));

    expect(await linkedKeys(t, roomA)).toEqual(["PROJ-2"]);
    expect(await linkedKeys(t, roomB)).toEqual([]);
    expect(await titles(t, roomB)).toEqual(["PROJ-1 - Old summary"]);
  });
});

describe("deleting an issue", () => {
  it("deletes its links", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "ann");
    const roomId = await openRoom(t, "Room");
    const { issueId } = await importJiraIssue(t, roomId, "PROJ-1");
    await importJiraIssue(t, roomId, "PROJ-2");

    await as(t, "ann").mutation(api.issues.remove, { issueId });

    expect(await linkedKeys(t, roomId)).toEqual(["PROJ-2"]);
  });
});
