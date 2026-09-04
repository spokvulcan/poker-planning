/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { requireCan } from "./model/auth";
import type { MemberRole, RetroPermissions } from "./permissions";

// The guard's action assembly narrows on the ceremony before indexing a
// category (ADR-0013), and reads owner absence for the new verbs. The pure
// decision is covered in retroPermissions.test.ts; this file proves the IO
// assembly feeds it the right inputs.

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

async function seedRoom(
  t: T,
  opts: {
    roomType?: "canvas" | "retro";
    permissions?: RetroPermissions;
    ownerId?: Id<"users">;
  } = {}
): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name: "R",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: false,
      ...(opts.roomType ? { roomType: opts.roomType } : {}),
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

describe("permission guard — category set keyed by room type", () => {
  it("a retro room at defaults denies a participant stageFlow and allows a facilitator", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { roomType: "retro" });
    await addMember(t, roomId, "auth-p");
    await addMember(t, roomId, "auth-f", "facilitator");

    await expect(
      t
        .withIdentity({ subject: "auth-p" })
        .run((ctx) => requireCan(ctx, roomId, { kind: "category", category: "stageFlow" }))
    ).rejects.toThrow("Only facilitators and the owner can do this.");

    const bundle = await t
      .withIdentity({ subject: "auth-f" })
      .run((ctx) => requireCan(ctx, roomId, { kind: "category", category: "stageFlow" }));
    expect(bundle.room._id).toBe(roomId);
  });

  it("a retro room honours its stored retro permissions", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, {
      roomType: "retro",
      permissions: {
        stageFlow: "everyone",
        cardManagement: "facilitators",
        actionManagement: "everyone",
        retroSettings: "facilitators",
      },
    });
    await addMember(t, roomId, "auth-p");

    await t
      .withIdentity({ subject: "auth-p" })
      .run((ctx) => requireCan(ctx, roomId, { kind: "category", category: "stageFlow" }));
  });

  it("a poker category on a retro room is refused as not applying to the room type", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { roomType: "retro" });
    await addMember(t, roomId, "auth-o", "owner");

    await expect(
      t
        .withIdentity({ subject: "auth-o" })
        .run((ctx) => requireCan(ctx, roomId, { kind: "category", category: "revealCards" }))
    ).rejects.toThrow("This action does not apply to this room type.");
  });

  it("a retro category on a poker room is refused as not applying to the room type", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t); // legacy poker room
    await addMember(t, roomId, "auth-o", "owner");

    await expect(
      t
        .withIdentity({ subject: "auth-o" })
        .run((ctx) => requireCan(ctx, roomId, { kind: "category", category: "cardManagement" }))
    ).rejects.toThrow("This action does not apply to this room type.");
  });
});

describe("permission guard — ratchet, delete and claim", () => {
  it("ratchet and delete are owner-only", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { roomType: "retro" });
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    await addMember(t, roomId, "auth-f", "facilitator");

    for (const verb of ["ratchet", "delete"] as const) {
      await t
        .withIdentity({ subject: "auth-o" })
        .run((ctx) => requireCan(ctx, roomId, { kind: "relationship", verb }));
      await expect(
        t
          .withIdentity({ subject: "auth-f" })
          .run((ctx) => requireCan(ctx, roomId, { kind: "relationship", verb }))
      ).rejects.toThrow("Only the owner can do this.");
    }
  });

  it("ratchet under lockdown reads owner absence and reports it", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { roomType: "retro" });
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    await addMember(t, roomId, "auth-f", "facilitator");
    // The owner leaves: their membership is deleted.
    await t.run(async (ctx) => {
      const m = await ctx.db
        .query("roomMemberships")
        .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", ownerId))
        .first();
      await ctx.db.delete(m!._id);
    });

    await expect(
      t
        .withIdentity({ subject: "auth-f" })
        .run((ctx) => requireCan(ctx, roomId, { kind: "relationship", verb: "ratchet" }))
    ).rejects.toThrow(
      "Room owner has left. Owner-level actions are disabled until the owner returns."
    );
  });

  it("claim is refused for every room member of a teamless room", async () => {
    // A teamless room grants no team role, so claim is insufficient-role for
    // everyone — including the room owner.
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t, { roomType: "retro" });
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    await addMember(t, roomId, "auth-p");

    for (const subject of ["auth-o", "auth-p"]) {
      await expect(
        t
          .withIdentity({ subject })
          .run((ctx) => requireCan(ctx, roomId, { kind: "relationship", verb: "claim" }))
      ).rejects.toThrow("Only a team admin can claim this room.");
    }
  });
});

describe("permission guard — claim on a team room (ADR-0013)", () => {
  async function seedTeam(t: TestConvex<typeof schema>) {
    return t.run((ctx) =>
      ctx.db.insert("teams", {
        name: "Acme",
        inviteToken: "tok",
        retroDefaults: {
          attribution: "named",
          joinPolicy: "anyone",
          permissions: {
            stageFlow: "facilitators",
            cardManagement: "facilitators",
            actionManagement: "everyone",
            retroSettings: "facilitators",
          },
        },
        createdAt: Date.now(),
      })
    );
  }

  async function addTeamRole(
    t: TestConvex<typeof schema>,
    teamId: Id<"teams">,
    userId: Id<"users">,
    role: "admin" | "member"
  ) {
    await t.run((ctx) =>
      ctx.db.insert("teamMemberships", { teamId, userId, role, joinedAt: Date.now() })
    );
  }

  async function leaveRoom(t: TestConvex<typeof schema>, roomId: Id<"rooms">, userId: Id<"users">) {
    await t.run(async (ctx) => {
      const m = await ctx.db
        .query("roomMemberships")
        .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
        .first();
      await ctx.db.delete(m!._id);
    });
  }

  it("a team admin claims a team room whose owner is absent", async () => {
    const t = convexTest(schema, modules);
    const teamId = await seedTeam(t);
    const roomId = await seedRoom(t, { roomType: "retro" });
    await t.run((ctx) => ctx.db.patch(roomId, { teamId }));
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    await addTeamRole(t, teamId, ownerId, "member");
    const adminId = await addMember(t, roomId, "auth-a");
    await addTeamRole(t, teamId, adminId, "admin");
    await leaveRoom(t, roomId, ownerId);

    await t
      .withIdentity({ subject: "auth-a" })
      .run((ctx) => requireCan(ctx, roomId, { kind: "relationship", verb: "claim" }));
  });

  it("a team admin claims when the owner is present but no longer in the Team", async () => {
    const t = convexTest(schema, modules);
    const teamId = await seedTeam(t);
    const roomId = await seedRoom(t, { roomType: "retro" });
    await t.run((ctx) => ctx.db.patch(roomId, { teamId }));
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    const adminId = await addMember(t, roomId, "auth-a");
    await addTeamRole(t, teamId, adminId, "admin");

    await t
      .withIdentity({ subject: "auth-a" })
      .run((ctx) => requireCan(ctx, roomId, { kind: "relationship", verb: "claim" }));
  });

  it("a team admin is refused with owner-present while the owner is here and in the Team", async () => {
    const t = convexTest(schema, modules);
    const teamId = await seedTeam(t);
    const roomId = await seedRoom(t, { roomType: "retro" });
    await t.run((ctx) => ctx.db.patch(roomId, { teamId }));
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    await addTeamRole(t, teamId, ownerId, "member");
    const adminId = await addMember(t, roomId, "auth-a");
    await addTeamRole(t, teamId, adminId, "admin");

    await expect(
      t
        .withIdentity({ subject: "auth-a" })
        .run((ctx) => requireCan(ctx, roomId, { kind: "relationship", verb: "claim" }))
    ).rejects.toThrow("The owner is still here — ask them to transfer ownership.");
  });

  it("a team member who is not an admin is refused, and so is anyone on a teamless room", async () => {
    const t = convexTest(schema, modules);
    const teamId = await seedTeam(t);
    const roomId = await seedRoom(t, { roomType: "retro" });
    await t.run((ctx) => ctx.db.patch(roomId, { teamId }));
    const ownerId = await addMember(t, roomId, "auth-o", "owner");
    await t.run((ctx) => ctx.db.patch(roomId, { ownerId }));
    const memberId = await addMember(t, roomId, "auth-m");
    await addTeamRole(t, teamId, memberId, "member");
    await leaveRoom(t, roomId, ownerId);

    await expect(
      t
        .withIdentity({ subject: "auth-m" })
        .run((ctx) => requireCan(ctx, roomId, { kind: "relationship", verb: "claim" }))
    ).rejects.toThrow("Only a team admin can claim this room.");
  });
});
