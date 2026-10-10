/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as Issues from "./model/issues";
import { MAX_ISSUES_PER_ROOM } from "./constants";
import { seedUser } from "./analytics.seeds";

// Admission through the issue module, with no tracker involved: a typed issue
// and one brought from a tracker with its link take the same path.

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

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

function jiraLink(externalId: string): Issues.IssueLink {
  return {
    provider: "jira",
    externalId,
    externalUrl: `https://site.atlassian.net/browse/${externalId}`,
  };
}

async function createLocal(
  t: T,
  roomId: Id<"rooms">,
  title: string
): Promise<Id<"issues">> {
  const admission = await t.run(async (ctx) => Issues.admitIssue(ctx, { room: (await ctx.db.get("rooms", roomId))!, title }));
  return admission.issueId;
}

async function admitLinked(
  t: T,
  roomId: Id<"rooms">,
  externalId: string
): Promise<Issues.Admission> {
  return t.run(async (ctx) =>
    Issues.admitIssue(ctx, {
      room: (await ctx.db.get("rooms", roomId))!,
      title: `${externalId} - Summary`,
      link: jiraLink(externalId),
    })
  );
}

async function listRoomIssues(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("issues")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

async function listLinks(t: T) {
  return t.run((ctx) => ctx.db.query("issueLinks").collect());
}

async function readRoom(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) => ctx.db.get("rooms", roomId));
}

/** The refusal a call is turned away with: its code and the words people see. */
async function refusalWith(call: Promise<unknown>): Promise<{ code: string; message?: string }> {
  try {
    await call;
    return { code: "resolved" };
  } catch (error) {
    if (error instanceof ConvexError) return error.data as { code: string; message: string };
    throw error;
  }
}

/**
 * Puts `count` issues in the room (the cap by default), in batches to stay
 * within transaction limits.
 */
async function fillRoom(
  t: T,
  roomId: Id<"rooms">,
  count: number = MAX_ISSUES_PER_ROOM
): Promise<void> {
  for (let start = 1; start <= count; start += 100) {
    await t.run(async (ctx) => {
      for (let n = start; n < start + 100 && n <= count; n++) {
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
  await t.run((ctx) => ctx.db.patch("rooms", roomId, { nextIssueNumber: count }));
}

describe("issue admission (Issues.admitIssue)", () => {
  it("allocates sequential IDs across local + imported issues with no reuse", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    await createLocal(t, roomId, "First");
    await createLocal(t, roomId, "Second");
    const { issueId: importedId } = await admitLinked(t, roomId, "PROJ-1");

    const issues = await listRoomIssues(t, roomId);
    expect(issues.map((i) => i.sequentialId).sort((a, b) => a - b)).toEqual([
      1, 2, 3,
    ]);
    const imported = issues.find((i) => i._id === importedId);
    // The drifted pre-increment copy reused sequentialId 2 here (PP-2 dupe)
    expect(imported?.sequentialId).toBe(3);
    expect((await readRoom(t, roomId))?.nextIssueNumber).toBe(3);
  });

  it("enforces the per-room cap on both local create and import", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await fillRoom(t, roomId);

    const full = { code: "forbidden", message: "Rooms are limited to 500 issues" };
    expect(await refusalWith(createLocal(t, roomId, "One too many"))).toEqual(full);
    expect(await refusalWith(admitLinked(t, roomId, "PROJ-9"))).toEqual(full);
    expect((await readRoom(t, roomId))?.nextIssueNumber).toBe(
      MAX_ISSUES_PER_ROOM
    );
    expect(await listLinks(t)).toHaveLength(0);
  });

  it("reports a tracker issue already in a full room as in the room, not refused", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await fillRoom(t, roomId, MAX_ISSUES_PER_ROOM - 1);
    const last = await admitLinked(t, roomId, "PROJ-8");

    expect(await admitLinked(t, roomId, "PROJ-8")).toEqual({
      kind: "alreadyInRoom",
      issueId: last.issueId,
    });
  });

  it("appends an imported issue after the current max order", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    // Non-contiguous high order exercises the max-order scan
    await t.run((ctx) =>
      ctx.db.insert("issues", {
        roomId,
        sequentialId: 1,
        title: "Seeded",
        status: "pending",
        createdAt: Date.now(),
        order: 7,
      })
    );
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { nextIssueNumber: 1 }));

    const { issueId: importedId } = await admitLinked(t, roomId, "PROJ-2");
    const imported = await t.run((ctx) => ctx.db.get("issues", importedId));
    expect(imported?.order).toBe(8);
    expect(imported?.sequentialId).toBe(2);
  });

  it("advances the room counter exactly once per issue across a mixed batch", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    await createLocal(t, roomId, "Local 1");
    await admitLinked(t, roomId, "PROJ-1");
    await createLocal(t, roomId, "Local 2");
    await admitLinked(t, roomId, "PROJ-2");

    const issues = await listRoomIssues(t, roomId);
    expect(issues).toHaveLength(4);
    expect(issues.map((i) => i.sequentialId).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4,
    ]);
    expect((await readRoom(t, roomId))?.nextIssueNumber).toBe(4);
  });

  it("concurrent callers all get unique sequential IDs", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    // convex-test serializes function execution, so this locks in uniqueness
    // under simultaneous invocation; the OCC guarantee underneath is Convex's
    // own transactionality (single-document read-modify-write per mutation).
    await Promise.all(
      ["A", "B", "C", "D", "E"].map((title) => createLocal(t, roomId, title))
    );

    const issues = await listRoomIssues(t, roomId);
    expect(issues).toHaveLength(5);
    expect(issues.map((i) => i.sequentialId).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect((await readRoom(t, roomId))?.nextIssueNumber).toBe(5);
  });

  it("admits a linked issue through the issue module, tagging its link with the room", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await createLocal(t, roomId, "Local");

    const admission = await t.run(async (ctx) =>
      Issues.admitIssue(ctx, {
        room: (await ctx.db.get("rooms", roomId))!,
        title: "PROJ-7 - Summary",
        link: jiraLink("PROJ-7"),
      })
    );

    expect(admission.kind).toBe("admitted");
    const issue = await t.run((ctx) => ctx.db.get("issues", admission.issueId));
    expect(issue).toMatchObject({ roomId, sequentialId: 2, title: "PROJ-7 - Summary" });
    expect(await listLinks(t)).toEqual([
      expect.objectContaining({
        issueId: admission.issueId,
        roomId,
        provider: "jira",
        externalId: "PROJ-7",
        externalUrl: "https://site.atlassian.net/browse/PROJ-7",
      }),
    ]);
  });

  it("re-importing the same external id in one room creates no second issue", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    const first = await admitLinked(t, roomId, "PROJ-3");
    const again = await admitLinked(t, roomId, "PROJ-3");

    expect(first.kind).toBe("admitted");
    expect(again).toEqual({ kind: "alreadyInRoom", issueId: first.issueId });

    const issues = await listRoomIssues(t, roomId);
    expect(issues).toHaveLength(1);
    // The skipped re-import must not advance the counter
    expect((await readRoom(t, roomId))?.nextIssueNumber).toBe(1);
    expect(await listLinks(t)).toHaveLength(1);

    // Dedup is per-room: the same external id is allowed in another room
    const otherRoomId = await seedRoom(t);
    const otherImport = await admitLinked(t, otherRoomId, "PROJ-3");
    expect(otherImport.kind).toBe("admitted");
  });

  it("admits a tracker issue again once the room's issue holding it is deleted", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const first = await admitLinked(t, roomId, "PROJ-4");

    await t.run(async (ctx) =>
      Issues.removeIssue(ctx, (await ctx.db.get("rooms", roomId))!, (await ctx.db.get("issues", first.issueId))!)
    );
    const again = await admitLinked(t, roomId, "PROJ-4");

    expect(again.kind).toBe("admitted");
    expect(again.issueId).not.toBe(first.issueId);
    expect(await listRoomIssues(t, roomId)).toHaveLength(1);
  });

  it("finds a link written before links carried their room", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const otherRoomId = await seedRoom(t);
    // Rows from before issueLinks.roomId: invisible to the room's by_room read
    // until backfillIssueLinksRoomId tags them.
    const seedLegacy = (room: Id<"rooms">) =>
      t.run(async (ctx) => {
        const issueId = await ctx.db.insert("issues", {
          roomId: room,
          sequentialId: 1,
          title: "PROJ-5 - Summary",
          status: "pending",
          createdAt: Date.now(),
          order: 1,
        });
        await ctx.db.patch("rooms", room, { nextIssueNumber: 1 });
        await ctx.db.insert("issueLinks", {
          issueId,
          provider: "jira",
          externalId: "PROJ-5",
          externalUrl: "https://site.atlassian.net/browse/PROJ-5",
          lastSyncedAt: Date.now(),
        });
        return issueId;
      });
    const legacyIssueId = await seedLegacy(roomId);
    await seedLegacy(otherRoomId);

    expect(await admitLinked(t, roomId, "PROJ-5")).toEqual({
      kind: "alreadyInRoom",
      issueId: legacyIssueId,
    });
    expect(await listRoomIssues(t, roomId)).toHaveLength(1);
  });

  it("refuses a link whose page isn't https, and admits nothing", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    const admission = t.run(async (ctx) =>
      Issues.admitIssue(ctx, {
        room: (await ctx.db.get("rooms", roomId))!,
        title: "PROJ-6 - Summary",
        link: { provider: "jira", externalId: "PROJ-6", externalUrl: "javascript:alert(1)" },
      })
    );

    expect(await refusalWith(admission)).toEqual({
      code: "forbidden",
      message: "Issue links must be https:// URLs",
    });
    expect(await listRoomIssues(t, roomId)).toHaveLength(0);
    expect(await listLinks(t)).toHaveLength(0);
  });
});

describe("issues.create", () => {
  async function seedOwnedRoom(t: T) {
    await seedUser(t, "ann");
    const ann = t.withIdentity({ subject: "ann" });
    const roomId = await ann.mutation(api.rooms.create, { name: "Room" });
    await ann.mutation(api.users.join, { roomId, name: "ann", authUserId: "ann" });
    return { ann, roomId };
  }

  it("admits a typed issue on the import's path, sharing the room's numbering", async () => {
    const t = convexTest(schema, modules);
    const { ann, roomId } = await seedOwnedRoom(t);

    await admitLinked(t, roomId, "PROJ-1");
    const issueId = await ann.mutation(api.issues.create, { roomId, title: "Typed" });

    expect(await t.run((ctx) => ctx.db.get("issues", issueId))).toMatchObject({
      title: "Typed",
      sequentialId: 2,
    });
  });

  it("refuses a typed issue in a full room in words", async () => {
    const t = convexTest(schema, modules);
    const { ann, roomId } = await seedOwnedRoom(t);
    await fillRoom(t, roomId);

    expect(await refusalWith(ann.mutation(api.issues.create, { roomId, title: "One too many" }))).toEqual({
      code: "forbidden",
      message: "Rooms are limited to 500 issues",
    });
  });
});
