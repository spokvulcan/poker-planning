/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireRoomReader } from "./model/auth";
import { type T, seedRoom, seedUser as addUser, addMembership } from "./analytics.seeds";
import { withComponents } from "./components.setup";

// Room access (ADR-0009): `requireRoomReader` answers "may you read this
// room's contents?" from the caller's membership alone, and returns neither
// the room nor a membership row. It passes a room member and nobody else,
// refusing anyone else as the attendance guard does (ADR-0031). The
// enforcement net: a non-member cannot read canvas nodes, the room's issues,
// either issue export, or a retro's board and action items. That every such
// read takes the guard is held over every module in requireRoomWrite.test.ts.

const modules = import.meta.glob("./**/*.*s");

/** How every guard refuses a caller who isn't in the room (ADR-0031). */
const NOT_A_MEMBER = "Not a member of this room";

async function addMember(
  t: T,
  roomId: Id<"rooms">,
  authUserId: string
): Promise<Id<"users">> {
  const userId = await addUser(t, authUserId);
  await addMembership(t, roomId, userId, Date.now());
  return userId;
}

async function seedCanvasNode(t: T, roomId: Id<"rooms">): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("canvasNodes", {
      roomId,
      nodeId: "note-1",
      type: "note",
      position: { x: 0, y: 0 },
      data: { text: "private" },
      lastUpdatedAt: Date.now(),
    })
  );
}

describe("requireRoomReader — the room access guard", () => {
  it("passes a room member and returns identity and user — neither the room nor a membership", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await addMember(t, roomId, "auth-m");

    const result = await t
      .withIdentity({ subject: "auth-m" })
      .run((ctx) => requireRoomReader(ctx, roomId));

    expect(result.identity.subject).toBe("auth-m");
    expect(result.user._id).toBe(userId);
    expect(Object.keys(result).sort()).toEqual(["identity", "user"]);
  });

  it("reads only the caller and their membership, never the room row", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");

    const metrics = await t.withIdentity({ subject: "auth-m" }).run(async (ctx) => {
      await requireRoomReader(ctx, roomId);
      return await ctx.meta.getTransactionMetrics();
    });

    // A guard's reads join the read set of every query that takes it, so a
    // room row among them would re-run them all on each room patch (every
    // poker vote moves the room's activity clock). Two reads, one row each:
    // the caller's users row and their membership.
    expect(metrics.databaseQueries.used).toBe(2);
    expect(metrics.documentsRead.used).toBe(2);
  });

  it("refuses an authenticated non-member with the coded refusal the browser can show", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await addUser(t, "auth-x");

    await expect(
      t.withIdentity({ subject: "auth-x" }).run((ctx) => requireRoomReader(ctx, roomId))
    ).rejects.toMatchObject({ data: { code: "forbidden", message: NOT_A_MEMBER } });
  });

  it("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    await expect(
      t.run((ctx) => requireRoomReader(ctx, roomId))
    ).rejects.toThrow("Not authenticated");
  });

  it("decides from the membership alone: a deleted room refuses its former member like any non-member", async () => {
    const t = withComponents(convexTest(schema, modules));
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    const step = await t.mutation(internal.maintenance.deleteRoomAggregateChunk, { roomId });
    expect(step.done).toBe(true);

    // No separate "Room not found": the cascade took the membership with the room.
    await expect(
      t.withIdentity({ subject: "auth-m" }).run((ctx) => requireRoomReader(ctx, roomId))
    ).rejects.toThrow(NOT_A_MEMBER);
  });
});

describe("room-owned reads take the reader guard", () => {
  it("a non-member cannot read canvas nodes; a member can", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await addUser(t, "auth-x");
    await seedCanvasNode(t, roomId);

    await expect(
      t.withIdentity({ subject: "auth-x" }).query(api.canvas.getCanvasNodes, { roomId })
    ).rejects.toThrow(NOT_A_MEMBER);

    const nodes = await t
      .withIdentity({ subject: "auth-m" })
      .query(api.canvas.getCanvasNodes, { roomId });
    expect(nodes).toHaveLength(1);
  });

  it("a non-member cannot read the room's issues, the one being voted on, or one by id; a member can", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await addUser(t, "auth-x");
    const issueId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("issues", {
        roomId,
        sequentialId: 1,
        title: "Checkout flow",
        status: "voting",
        createdAt: Date.now(),
        order: 1,
      });
      await ctx.db.patch("rooms", roomId, { currentIssueId: id });
      return id;
    });
    const asMember = t.withIdentity({ subject: "auth-m" });
    const asOutsider = t.withIdentity({ subject: "auth-x" });

    await expect(asOutsider.query(api.issues.list, { roomId })).rejects.toThrow(NOT_A_MEMBER);
    await expect(asOutsider.query(api.issues.getCurrent, { roomId })).rejects.toThrow(NOT_A_MEMBER);
    await expect(asOutsider.query(api.issues.get, { roomId, issueId })).rejects.toThrow(NOT_A_MEMBER);

    expect((await asMember.query(api.issues.list, { roomId })).map((issue) => issue._id)).toEqual([issueId]);
    expect(await asMember.query(api.issues.getCurrent, { roomId })).toMatchObject({ _id: issueId });
    expect(await asMember.query(api.issues.get, { roomId, issueId })).toMatchObject({ title: "Checkout flow" });
  });

  it("the issue by id reads neither the room's row nor another room's issue", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const elsewhere = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    const [ours, theirs] = await t.run((ctx) =>
      Promise.all(
        [roomId, elsewhere].map((room) =>
          ctx.db.insert("issues", { roomId: room, sequentialId: 1, title: "I", status: "voting", createdAt: Date.now(), order: 1 })
        )
      )
    );
    await t.run((ctx) => ctx.db.patch("rooms", roomId, { currentIssueId: ours }));
    const asMember = t.withIdentity({ subject: "auth-m" });

    // An issue of another room is no issue of this one.
    expect(await asMember.query(api.issues.get, { roomId, issueId: theirs })).toBeNull();

    // What each registered query reads, run inside a transaction that counts
    // it: issues.get reads the room-access guard's two rows and the issue, and
    // no room row, which every vote patches, so a vote re-runs nothing that
    // subscribes to it; issues.getCurrent reads the room's row as well.
    const reads = await asMember.run(async (ctx) => {
      const used = async () => (await ctx.meta.getTransactionMetrics()).documentsRead.used;
      const start = await used();
      await ctx.runQuery(api.issues.get, { roomId, issueId: ours });
      const afterGet = await used();
      await ctx.runQuery(api.issues.getCurrent, { roomId });
      return { get: afterGet - start, getCurrent: (await used()) - afterGet };
    });
    expect(reads).toEqual({ get: 3, getCurrent: 4 });
  });

  it("a non-member cannot read the issue export; a member can", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await addUser(t, "auth-x");

    await expect(
      t.withIdentity({ subject: "auth-x" }).query(api.issues.getForExport, { roomId })
    ).rejects.toThrow(NOT_A_MEMBER);

    await expect(
      t.withIdentity({ subject: "auth-m" }).query(api.issues.getForExport, { roomId })
    ).resolves.toEqual([]);
  });

  it("a non-member cannot read the enhanced issue export; a member can", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await addUser(t, "auth-x");

    await expect(
      t.withIdentity({ subject: "auth-x" }).query(api.issues.getForEnhancedExport, { roomId })
    ).rejects.toThrow(NOT_A_MEMBER);

    await expect(
      t.withIdentity({ subject: "auth-m" }).query(api.issues.getForEnhancedExport, { roomId })
    ).resolves.toEqual([]);
  });

  it("a non-member cannot read a retro's board, vote count or action items; a member can", async () => {
    const t = convexTest(schema, modules);
    await addUser(t, "auth-m");
    await addUser(t, "auth-x");
    const asMember = t.withIdentity({ subject: "auth-m" });
    const asOutsider = t.withIdentity({ subject: "auth-x" });
    const roomId = await asMember.mutation(api.retro.create, { name: "Retro" });
    await asMember.mutation(api.users.join, { roomId, name: "M", authUserId: "auth-m" });

    await expect(asOutsider.query(api.retro.board, { roomId })).rejects.toThrow(
      NOT_A_MEMBER
    );
    await expect(asOutsider.query(api.retro.actionItems, { roomId })).rejects.toThrow(
      NOT_A_MEMBER
    );
    await expect(asOutsider.query(api.retro.votesCast, { roomId })).rejects.toThrow(
      NOT_A_MEMBER
    );

    expect(await asMember.query(api.retro.board, { roomId })).toEqual({
      stickies: [],
      writers: 0,
      myVotes: 0,
    });
    expect(await asMember.query(api.retro.votesCast, { roomId })).toBe(0);
    expect(await asMember.query(api.retro.actionItems, { roomId })).toEqual([]);
  });

  it("a non-member cannot read the room's Jira mapping or issue links; a member can", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await addUser(t, "auth-x");
    const asMember = t.withIdentity({ subject: "auth-m" });
    const asOutsider = t.withIdentity({ subject: "auth-x" });

    await expect(asOutsider.query(api.integrations.getRoomMapping, { roomId })).rejects.toThrow(
      NOT_A_MEMBER
    );
    await expect(asOutsider.query(api.integrations.getIssueLinks, { roomId })).rejects.toThrow(
      NOT_A_MEMBER
    );

    expect(await asMember.query(api.integrations.getRoomMapping, { roomId })).toBeNull();
    expect(await asMember.query(api.integrations.getIssueLinks, { roomId })).toEqual({});
  });

  it("an unauthenticated caller cannot read any of the three", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    await expect(t.query(api.canvas.getCanvasNodes, { roomId })).rejects.toThrow(
      "Not authenticated"
    );
    await expect(t.query(api.issues.getForExport, { roomId })).rejects.toThrow(
      "Not authenticated"
    );
    await expect(
      t.query(api.issues.getForEnhancedExport, { roomId })
    ).rejects.toThrow("Not authenticated");
  });
});
