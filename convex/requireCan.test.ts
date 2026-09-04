/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireCan, requireCanForUser } from "./model/auth";
import type { RequireCanSpec } from "./model/auth";
import type { MemberRole, RoomPermissions } from "./permissions";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

const EVERYWHERE_EVERYONE: RoomPermissions = {
  revealCards: "everyone",
  gameFlow: "everyone",
  issueManagement: "everyone",
  roomSettings: "everyone",
};

function permissions(overrides: Partial<RoomPermissions>): RoomPermissions {
  return { ...EVERYWHERE_EVERYONE, ...overrides };
}

async function seedRoom(
  t: T,
  opts: { permissions?: RoomPermissions; ownerId?: Id<"users"> } = {}
): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
      ...(opts.permissions ? { permissions: opts.permissions } : {}),
      ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
    })
  );
}

async function addMember(
  t: T,
  roomId: Id<"rooms">,
  authUserId: string,
  role?: MemberRole
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
      ...(role ? { role } : {}),
    });
    return userId;
  });
}

/** Simulates the owner explicitly leaving: the membership is deleted. */
async function removeMembership(
  t: T,
  roomId: Id<"rooms">,
  userId: Id<"users">
): Promise<void> {
  await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("roomMemberships")
      .withIndex("by_room_user", (q) =>
        q.eq("roomId", roomId).eq("userId", userId)
      )
      .first();
    if (membership) await ctx.db.delete(membership._id);
  });
}

describe("permission guard (requireCan) — category actions through rooms.rename", () => {
  it("participant may act when the category level is everyone", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t); // legacy room: defaults to everyone
    await addMember(t, roomId, "auth-p");
    const asP = t.withIdentity({ subject: "auth-p" });
    await asP.mutation(api.rooms.rename, { roomId, name: "New name" });
    const room = await t.run((ctx) => ctx.db.get(roomId));
    expect(room!.name).toBe("New name");
  });

  it("participant is denied when the category requires facilitators", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      permissions: permissions({ roomSettings: "facilitators" }),
    });
    await addMember(t, roomId, "auth-p");
    const asP = t.withIdentity({ subject: "auth-p" });
    await expect(
      asP.mutation(api.rooms.rename, { roomId, name: "New name" })
    ).rejects.toThrow("Only facilitators and the owner can do this.");
  });

  it("facilitator may act when the category requires facilitators", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      permissions: permissions({ roomSettings: "facilitators" }),
    });
    await addMember(t, roomId, "auth-f", "facilitator");
    const asF = t.withIdentity({ subject: "auth-f" });
    await asF.mutation(api.rooms.rename, { roomId, name: "New name" });
    const room = await t.run((ctx) => ctx.db.get(roomId));
    expect(room!.name).toBe("New name");
  });

  it("facilitator is denied when the category requires the owner", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      permissions: permissions({ roomSettings: "owner" }),
    });
    await addMember(t, roomId, "auth-f", "facilitator");
    const asF = t.withIdentity({ subject: "auth-f" });
    await expect(
      asF.mutation(api.rooms.rename, { roomId, name: "New name" })
    ).rejects.toThrow("Only the owner can do this.");
  });

  it("owner may act when the category requires the owner", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      permissions: permissions({ roomSettings: "owner" }),
    });
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    const asO = t.withIdentity({ subject: "auth-o" });
    await asO.mutation(api.rooms.rename, { roomId, name: "New name" });
    const room = await t.run((ctx) => ctx.db.get(roomId));
    expect(room!.name).toBe("New name");
  });
});

describe("permission guard — lockdown (ADR-0001)", () => {
  it("owner absent: owner-level action stays denied, reason refined to owner-absent", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      permissions: permissions({ roomSettings: "owner" }),
    });
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    await addMember(t, roomId, "auth-f", "facilitator");
    // The owner explicitly leaves → lockdown.
    await removeMembership(t, roomId, ownerId);

    const asF = t.withIdentity({ subject: "auth-f" });
    // Still denied (the role check alone denies it), but the message is the
    // owner-absent refinement — the guard must not gate on lockdown.
    await expect(
      asF.mutation(api.rooms.rename, { roomId, name: "New name" })
    ).rejects.toThrow(
      "Room owner has left. Owner-level actions are disabled until the owner returns."
    );
  });

  it("owner absent: facilitator-level actions still resolve correctly", async () => {
    // The owner-absence read can only refine owner-level denials, so the guard
    // skips it for anything else — behaviorally, lockdown must not leak into
    // facilitator-level outcomes.
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      permissions: permissions({ roomSettings: "facilitators" }),
    });
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    await addMember(t, roomId, "auth-f", "facilitator");
    await removeMembership(t, roomId, ownerId);

    const asF = t.withIdentity({ subject: "auth-f" });
    await asF.mutation(api.rooms.rename, { roomId, name: "New name" });
    const room = await t.run((ctx) => ctx.db.get(roomId));
    expect(room!.name).toBe("New name");
  });
});

describe("permission guard — relationship actions through users.remove", () => {
  it("facilitator cannot remove another facilitator (target-rank)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-f1", "facilitator");
    const targetId = await addMember(t, roomId, "auth-f2", "facilitator");
    const asF = t.withIdentity({ subject: "auth-f1" });
    await expect(
      asF.mutation(api.users.remove, { userId: targetId, roomId })
    ).rejects.toThrow("Facilitators can only remove participants.");
  });

  it("facilitator cannot remove the owner (target-rank)", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    await addMember(t, roomId, "auth-f", "facilitator");
    const asF = t.withIdentity({ subject: "auth-f" });
    await expect(
      asF.mutation(api.users.remove, { userId: ownerId, roomId })
    ).rejects.toThrow("Facilitators can only remove participants.");
  });

  it("facilitator can remove a participant", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-f", "facilitator");
    const targetId = await addMember(t, roomId, "auth-p");
    const asF = t.withIdentity({ subject: "auth-f" });
    await asF.mutation(api.users.remove, { userId: targetId, roomId });
    const membership = await t.run((ctx) =>
      ctx.db
        .query("roomMemberships")
        .withIndex("by_room_user", (q) =>
          q.eq("roomId", roomId).eq("userId", targetId)
        )
        .first()
    );
    expect(membership).toBeNull();
  });
});

describe("explicit-user guard variant (requireCanForUser)", () => {
  const spec: RequireCanSpec = { kind: "category", category: "roomSettings" };

  it("allows with the same verdict and bundle as requireCan", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      permissions: permissions({ roomSettings: "facilitators" }),
    });
    const userId = await addMember(t, roomId, "auth-f", "facilitator");

    const viaGuard = await t
      .withIdentity({ subject: "auth-f" })
      .run((ctx) => requireCan(ctx, roomId, spec));
    const viaVariant = await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      return requireCanForUser(ctx, user!, roomId, spec);
    });

    expect(viaVariant.user._id).toBe(viaGuard.user._id);
    expect(viaVariant.membership._id).toBe(viaGuard.membership._id);
    expect(viaVariant.room._id).toBe(viaGuard.room._id);
  });

  it("denies with the same message as requireCan", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      permissions: permissions({ roomSettings: "facilitators" }),
    });
    const userId = await addMember(t, roomId, "auth-p");

    await expect(
      t.withIdentity({ subject: "auth-p" }).run((ctx) => requireCan(ctx, roomId, spec))
    ).rejects.toThrow("Only facilitators and the owner can do this.");
    await expect(
      t.run(async (ctx) => {
        const user = await ctx.db.get(userId);
        return requireCanForUser(ctx, user!, roomId, spec);
      })
    ).rejects.toThrow("Only facilitators and the owner can do this.");
  });

  it("requires room membership", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        authUserId: "auth-outsider",
        name: "U",
        createdAt: Date.now(),
      })
    );
    await expect(
      t.run(async (ctx) => {
        const user = await ctx.db.get(userId);
        return requireCanForUser(ctx, user!, roomId, spec);
      })
    ).rejects.toThrow("Not a member of this room");
  });

  it("drives the registered internal path (verifyCanManageIssues) for a facilitator", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      permissions: permissions({ issueManagement: "facilitators" }),
    });
    const userId = await addMember(t, roomId, "auth-f", "facilitator");
    const result = await t.query(
      internal.integrations.jira.verifyCanManageIssues,
      { userId, roomId }
    );
    expect(result).toEqual({ userId });
  });

  it("denies a participant through verifyCanManageIssues with the guard's message", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      permissions: permissions({ issueManagement: "facilitators" }),
    });
    const userId = await addMember(t, roomId, "auth-p");
    await expect(
      t.query(internal.integrations.jira.verifyCanManageIssues, {
        userId,
        roomId,
      })
    ).rejects.toThrow("Only facilitators and the owner can do this.");
  });
});
