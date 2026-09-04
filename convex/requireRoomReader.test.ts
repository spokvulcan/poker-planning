/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireRoomReader } from "./model/auth";
import { type T, seedRoom, seedUser as addUser, addMembership } from "./analytics.seeds";

// Room access (ADR-0009): `requireRoomReader` answers "may you read this
// room's contents?" and never returns a membership row. It passes a room
// member or a member of the room's Team (ADR-0008). The enforcement net: a
// non-member non-team-member cannot read canvas nodes or either issue export.

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
  it("passes a room member and returns identity, user and room — never a membership", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    const userId = await addMember(t, roomId, "auth-m");

    const result = await t
      .withIdentity({ subject: "auth-m" })
      .run((ctx) => requireRoomReader(ctx, roomId));

    expect(result.identity.subject).toBe("auth-m");
    expect(result.user._id).toBe(userId);
    expect(result.room._id).toBe(roomId);
    expect(Object.keys(result).sort()).toEqual(["identity", "room", "user"]);
    expect("membership" in result).toBe(false);
  });

  it("rejects an authenticated non-member", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await addUser(t, "auth-x");

    await expect(
      t.withIdentity({ subject: "auth-x" }).run((ctx) => requireRoomReader(ctx, roomId))
    ).rejects.toThrow("You don't have access to this room");
  });

  it("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);

    await expect(
      t.run((ctx) => requireRoomReader(ctx, roomId))
    ).rejects.toThrow("Not authenticated");
  });

  it("rejects a missing room", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await t.run((ctx) => ctx.db.delete(roomId));

    await expect(
      t.withIdentity({ subject: "auth-m" }).run((ctx) => requireRoomReader(ctx, roomId))
    ).rejects.toThrow("Room not found");
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
    ).rejects.toThrow("You don't have access to this room");

    const nodes = await t
      .withIdentity({ subject: "auth-m" })
      .query(api.canvas.getCanvasNodes, { roomId });
    expect(nodes).toHaveLength(1);
  });

  it("a non-member cannot read the issue export; a member can", async () => {
    const t = convexTest(schema, modules);
    const roomId = await seedRoom(t);
    await addMember(t, roomId, "auth-m");
    await addUser(t, "auth-x");

    await expect(
      t.withIdentity({ subject: "auth-x" }).query(api.issues.getForExport, { roomId })
    ).rejects.toThrow("You don't have access to this room");

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
    ).rejects.toThrow("You don't have access to this room");

    await expect(
      t.withIdentity({ subject: "auth-m" }).query(api.issues.getForEnhancedExport, { roomId })
    ).resolves.toEqual([]);
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

describe("requireRoomReader — the Team half (ADR-0008)", () => {
  async function seedTeamRoom(t: T) {
    const teamId = await t.run((ctx) =>
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
    const roomId = await t.run((ctx) =>
      ctx.db.insert("rooms", {
        name: "Team retro",
        autoCompleteVoting: false,
        isGameOver: false,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        retained: true,
        teamId,
      })
    );
    return { teamId, roomId };
  }

  async function addTeamMember(t: T, teamId: Id<"teams">, authUserId: string) {
    const userId = await addUser(t, authUserId);
    await t.run((ctx) =>
      ctx.db.insert("teamMemberships", { teamId, userId, role: "member", joinedAt: Date.now() })
    );
    return userId;
  }

  it("a Team member who never attended the room passes, and reads its canvas nodes", async () => {
    const t = convexTest(schema, modules);
    const { teamId, roomId } = await seedTeamRoom(t);
    await addTeamMember(t, teamId, "auth-team");
    await seedCanvasNode(t, roomId);

    const result = await t
      .withIdentity({ subject: "auth-team" })
      .run((ctx) => requireRoomReader(ctx, roomId));
    expect(result.room._id).toBe(roomId);
    expect("membership" in result).toBe(false);

    const nodes = await t
      .withIdentity({ subject: "auth-team" })
      .query(api.canvas.getCanvasNodes, { roomId });
    expect(nodes).toHaveLength(1);
  });

  it("a non-member who is not in the Team is denied", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRoom(t);
    await addUser(t, "auth-x");

    await expect(
      t.withIdentity({ subject: "auth-x" }).run((ctx) => requireRoomReader(ctx, roomId))
    ).rejects.toThrow("You don't have access to this room");
  });

  it("a member of a different Team is denied", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRoom(t);
    const { teamId: otherTeam } = await seedTeamRoom(t);
    await addTeamMember(t, otherTeam, "auth-other");

    await expect(
      t.withIdentity({ subject: "auth-other" }).run((ctx) => requireRoomReader(ctx, roomId))
    ).rejects.toThrow("You don't have access to this room");
  });

  it("denies rather than throws when the room's Team row is gone", async () => {
    const t = convexTest(schema, modules);
    const { teamId, roomId } = await seedTeamRoom(t);
    await addTeamMember(t, teamId, "auth-team");
    await t.run((ctx) => ctx.db.delete(teamId));

    await expect(
      t.withIdentity({ subject: "auth-team" }).run((ctx) => requireRoomReader(ctx, roomId))
    ).rejects.toThrow("You don't have access to this room");
  });

  it("a room attendee still passes whether or not they are in the Team", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRoom(t);
    await addMember(t, roomId, "auth-m");

    const result = await t
      .withIdentity({ subject: "auth-m" })
      .run((ctx) => requireRoomReader(ctx, roomId));
    expect(result.room._id).toBe(roomId);
  });
});
