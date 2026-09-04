/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

async function seedRoom(t: T): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
    })
  );
}

async function addMember(
  t: T,
  roomId: Id<"rooms">,
  authUserId: string
): Promise<Id<"users">> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authUserId,
      name: "U",
      createdAt: Date.now(),
    });
    await ctx.db.insert("roomMemberships", {
      roomId,
      userId,
      isSpectator: false,
      joinedAt: Date.now(),
    });
    return userId;
  });
}

async function addUser(t: T, authUserId: string): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId,
      name: "U",
      createdAt: Date.now(),
    })
  );
}

async function seedIssue(t: T, roomId: Id<"rooms">): Promise<Id<"issues">> {
  return t.run((ctx) =>
    ctx.db.insert("issues", {
      roomId,
      sequentialId: 1,
      title: "Issue 1",
      status: "voting",
      createdAt: Date.now(),
      order: 0,
    })
  );
}

async function seedNode(
  t: T,
  roomId: Id<"rooms">,
  nodeId: string
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("canvasNodes", {
      roomId,
      nodeId,
      type: "session",
      position: { x: 0, y: 0 },
      data: {},
      lastUpdatedAt: Date.now(),
    })
  );
}

describe("acting-user guard (requireActingUser)", () => {
  it("probe: t.withIdentity satisfies ctx.auth.getUserIdentity in a registered handler", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-a");
    // getCanvasNodes now requires membership, so it only succeeds if the
    // identity reaches ctx.auth.getUserIdentity() inside the registered query.
    const asA = t.withIdentity({ subject: "auth-a" });
    expect(await asA.query(api.canvas.getCanvasNodes, { roomId })).toEqual([]);
    // Without an identity the same handler throws from requireAuth.
    await expect(t.query(api.canvas.getCanvasNodes, { roomId })).rejects.toThrow(
      "Not authenticated"
    );
  });

  it("non-member cannot read canvas nodes", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addUser(t, "auth-outsider"); // user record, but no membership
    const asOutsider = t.withIdentity({ subject: "auth-outsider" });
    await expect(
      asOutsider.query(api.canvas.getCanvasNodes, { roomId })
    ).rejects.toThrow("You don't have access to this room");
  });

  it("actor mismatch throws on updateNodePosition", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-a");
    const userB = await addMember(t, roomId, "auth-b");
    const asA = t.withIdentity({ subject: "auth-a" });
    await expect(
      asA.mutation(api.canvas.updateNodePosition, {
        roomId,
        nodeId: "session-current",
        position: { x: 1, y: 1 },
        userId: userB,
      })
    ).rejects.toThrow("Cannot act as another user");
  });

  it("actor mismatch throws on pickCard", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-a");
    const userB = await addMember(t, roomId, "auth-b");
    const asA = t.withIdentity({ subject: "auth-a" });
    await expect(
      asA.mutation(api.votes.pickCard, {
        roomId,
        userId: userB,
        cardLabel: "5",
        cardValue: 5,
      })
    ).rejects.toThrow("Cannot vote as another user");
  });

  it("member casts a vote through the registered handler", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userA = await addMember(t, roomId, "auth-a");
    const asA = t.withIdentity({ subject: "auth-a" });
    await asA.mutation(api.votes.pickCard, {
      roomId,
      userId: userA,
      cardLabel: "5",
      cardValue: 5,
    });
    const votes = await t.run((ctx) =>
      ctx.db
        .query("votes")
        .withIndex("by_room_user", (q) =>
          q.eq("roomId", roomId).eq("userId", userA)
        )
        .collect()
    );
    expect(votes).toHaveLength(1);
    expect(votes[0].cardLabel).toBe("5");
  });

  it("member updates a node position through the registered handler", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userA = await addMember(t, roomId, "auth-a");
    await seedNode(t, roomId, "session-current");
    const asA = t.withIdentity({ subject: "auth-a" });
    await asA.mutation(api.canvas.updateNodePosition, {
      roomId,
      nodeId: "session-current",
      position: { x: 42, y: 7 },
      userId: userA,
    });
    const node = await t.run((ctx) =>
      ctx.db
        .query("canvasNodes")
        .withIndex("by_room_node", (q) =>
          q.eq("roomId", roomId).eq("nodeId", "session-current")
        )
        .unique()
    );
    expect(node!.position).toEqual({ x: 42, y: 7 });
    expect(node!.lastUpdatedBy).toBe(userA);
  });

  it("note CRUD is unchanged for a real member", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userA = await addMember(t, roomId, "auth-a");
    const issueId = await seedIssue(t, roomId);
    const asA = t.withIdentity({ subject: "auth-a" });
    const nodeId = `note-${issueId}`;

    await asA.mutation(api.canvas.createNote, { roomId, issueId, userId: userA });
    await asA.mutation(api.canvas.updateNoteContent, {
      roomId,
      nodeId,
      content: "acceptance criteria",
      userId: userA,
    });

    // Read back through the live getCanvasNodes endpoint (requireRoomMember
    // guard) — the old getNoteContentForIssue read seam is deleted.
    const nodes = await asA.query(api.canvas.getCanvasNodes, { roomId });
    expect(nodes.find((n) => n.nodeId === nodeId)).toMatchObject({
      type: "note",
      data: { content: "acceptance criteria" },
    });

    await asA.mutation(api.canvas.deleteNote, { roomId, nodeId, userId: userA });
    const afterDelete = await asA.query(api.canvas.getCanvasNodes, { roomId });
    expect(afterDelete.find((n) => n.nodeId === nodeId)).toBeUndefined();
  });
});
