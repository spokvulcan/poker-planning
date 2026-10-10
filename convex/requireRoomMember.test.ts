/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { requireRoomMember, requireRoomWrite } from "./model/auth";
import { type T, seedRoom, seedUser as addUser, addMembership } from "./analytics.seeds";

// Room attendance: `requireRoomMember` answers "is this person in this
// room?" for every write on a room, under the room-scoped step, and hands
// back the room it checked so no handler reads the room again.

const modules = import.meta.glob("./**/*.*s");

async function addMember(
  t: T,
  roomId: Id<"rooms">,
  authUserId: string
): Promise<Id<"users">> {
  const userId = await addUser(t, authUserId);
  await addMembership(t, roomId, userId, Date.now());
  return userId;
}

describe("requireRoomMember — the room attendance guard", () => {
  it("passes a room member and returns the room it checked, with the identity, user and membership", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, "Sprint 12");
    const userId = await addMember(t, roomId, "auth-m");

    const result = await t
      .withIdentity({ subject: "auth-m" })
      .run((ctx) => requireRoomMember(ctx, roomId));

    expect(result.room).toMatchObject({ _id: roomId, name: "Sprint 12" });
    expect(result.identity.subject).toBe("auth-m");
    expect(result.user._id).toBe(userId);
    expect(result.membership).toMatchObject({ roomId, userId });
  });

  it("rejects an authenticated non-member", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await addUser(t, "auth-x");

    await expect(
      t.withIdentity({ subject: "auth-x" }).run((ctx) => requireRoomMember(ctx, roomId))
    ).rejects.toThrow("Not a member of this room");
  });

  it("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    await expect(
      t.run((ctx) => requireRoomMember(ctx, roomId))
    ).rejects.toThrow("Not authenticated");
  });

  it("never returns without the room: a membership that outlived its room is refused", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await t.run((ctx) => ctx.db.delete("rooms", roomId));

    await expect(
      t.withIdentity({ subject: "auth-m" }).run((ctx) => requireRoomMember(ctx, roomId))
    ).rejects.toThrow("Room not found");
  });
});

describe("the guards built on room attendance read the room once", () => {
  it("the attendance guard reads the caller, their membership and the room, one row each", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");

    const metrics = await t.withIdentity({ subject: "auth-m" }).run(async (ctx) => {
      await requireRoomMember(ctx, roomId);
      return await ctx.meta.getTransactionMetrics();
    });

    expect(metrics.documentsRead.used).toBe(3);
  });

  it("the step's permission guard decides on the room the attendance guard loaded", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t); // no permissions set: every category is open to everyone
    await addMember(t, roomId, "auth-m");

    const metrics = await t.withIdentity({ subject: "auth-m" }).run(async (ctx) => {
      await requireRoomWrite(ctx, roomId, { kind: "category", category: "roomSettings" });
      return await ctx.meta.getTransactionMetrics();
    });

    // The caller's users row, their membership and the room: nothing twice.
    expect(metrics.documentsRead.used).toBe(3);
  });
});
