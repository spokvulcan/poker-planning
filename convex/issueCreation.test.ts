/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as Issues from "./model/issues";
import { MAX_ISSUES_PER_ROOM } from "./constants";

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
    })
  );
}

async function createLocal(
  t: T,
  roomId: Id<"rooms">,
  title: string
): Promise<Id<"issues">> {
  return t.run((ctx) => Issues.createIssue(ctx, { roomId, title }));
}

async function importJira(
  t: T,
  roomId: Id<"rooms">,
  externalId: string
): Promise<Id<"issues"> | null> {
  return t.mutation(internal.integrations.jira.createIssueWithLink, {
    roomId,
    title: `${externalId} - Summary`,
    provider: "jira",
    externalId,
    externalUrl: `https://site.atlassian.net/browse/${externalId}`,
  });
}

async function listRoomIssues(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("issues")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

async function readRoom(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) => ctx.db.get(roomId));
}

describe("issue creation (createIssueInRoom)", () => {
  it("allocates sequential IDs across local + imported issues with no reuse", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    await createLocal(t, roomId, "First");
    await createLocal(t, roomId, "Second");
    const importedId = await importJira(t, roomId, "PROJ-1");

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

    // Fill the room to the cap in batches to stay within transaction limits
    for (let batch = 0; batch < MAX_ISSUES_PER_ROOM / 100; batch++) {
      await t.run(async (ctx) => {
        for (let i = 0; i < 100; i++) {
          const n = batch * 100 + i + 1;
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
    await t.run((ctx) =>
      ctx.db.patch(roomId, { nextIssueNumber: MAX_ISSUES_PER_ROOM })
    );

    await expect(createLocal(t, roomId, "One too many")).rejects.toThrow(
      `Rooms are limited to ${MAX_ISSUES_PER_ROOM} issues`
    );
    await expect(importJira(t, roomId, "PROJ-9")).rejects.toThrow(
      `Rooms are limited to ${MAX_ISSUES_PER_ROOM} issues`
    );
    expect((await readRoom(t, roomId))?.nextIssueNumber).toBe(
      MAX_ISSUES_PER_ROOM
    );
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
    await t.run((ctx) => ctx.db.patch(roomId, { nextIssueNumber: 1 }));

    const importedId = await importJira(t, roomId, "PROJ-2");
    const imported = await t.run((ctx) => ctx.db.get(importedId!));
    expect(imported?.order).toBe(8);
    expect(imported?.sequentialId).toBe(2);
  });

  it("advances the room counter exactly once per issue across a mixed batch", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    await createLocal(t, roomId, "Local 1");
    await importJira(t, roomId, "PROJ-1");
    await createLocal(t, roomId, "Local 2");
    await importJira(t, roomId, "PROJ-2");

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
      ["A", "B", "C", "D", "E"].map((title) =>
        t.run((ctx) => Issues.createIssueInRoom(ctx, { roomId, title }))
      )
    );

    const issues = await listRoomIssues(t, roomId);
    expect(issues).toHaveLength(5);
    expect(issues.map((i) => i.sequentialId).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect((await readRoom(t, roomId))?.nextIssueNumber).toBe(5);
  });

  it("re-importing the same external id in one room creates no second issue", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    const first = await importJira(t, roomId, "PROJ-3");
    const again = await importJira(t, roomId, "PROJ-3");

    expect(first).not.toBeNull();
    expect(again).toBeNull();

    const issues = await listRoomIssues(t, roomId);
    expect(issues).toHaveLength(1);
    // The skipped re-import must not advance the counter
    expect((await readRoom(t, roomId))?.nextIssueNumber).toBe(1);

    const links = await t.run((ctx) => ctx.db.query("issueLinks").collect());
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      issueId: first,
      provider: "jira",
      externalId: "PROJ-3",
      externalUrl: "https://site.atlassian.net/browse/PROJ-3",
    });

    // Dedup is per-room: the same external id is allowed in another room
    const otherRoomId = await seedRoom(t);
    const otherImport = await importJira(t, otherRoomId, "PROJ-3");
    expect(otherImport).not.toBeNull();
  });
});
