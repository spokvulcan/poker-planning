/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_PERMISSIONS } from "./permissions";
import { DEFAULT_RETRO_FORMAT, RETRO_FORMATS } from "./model/retroFormats";
import { RETRO_TABLES } from "./model/roomAggregate";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// A team retro (spec §5, §6.1, §4.3, §15.2; ADR-0008, ADR-0013, ADR-0019):
// created with the Team's defaults copied by value and `retained: true`;
// adoptable once; recoverable by `claim`; deletable through the cascade;
// readable by the Team without attendance; listed on the team page and
// the dashboard.

const modules = import.meta.glob("./**/*.*s");

const seedUser = (t: T, authUserId: string, accountType?: "anonymous" | "permanent") =>
  seedNamedUser(t, authUserId, authUserId, accountType);

const as = (t: T, subject: string) => t.withIdentity({ subject });

async function createTeam(t: T, subject: string, name = "Acme"): Promise<Id<"teams">> {
  return as(t, subject).mutation(api.teams.create, { name });
}

async function joinTeam(t: T, teamId: Id<"teams">, subject: string): Promise<void> {
  const team = await t.run((ctx) => ctx.db.get(teamId));
  await as(t, subject).mutation(api.teams.joinByInvite, { inviteToken: team!.inviteToken });
}

const CUSTOM_DEFAULTS = {
  attribution: "anonymous" as const,
  joinPolicy: "teamMembers" as const,
  permissions: { ...DEFAULT_RETRO_PERMISSIONS, actionManagement: "facilitators" as const },
};

async function retroRow(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("retros")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .unique()
  );
}

async function membershipsOf(t: T, roomId: Id<"rooms">) {
  return t.run((ctx) =>
    ctx.db
      .query("roomMemberships")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
}

async function membershipOf(t: T, roomId: Id<"rooms">, userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("roomMemberships")
      .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .unique()
  );
}

const createRetro = (t: T, subject: string, args: { teamId?: Id<"teams">; name?: string; formatName?: string } = {}) =>
  as(t, subject).mutation(api.retro.create, {
    name: args.name ?? "R",
    formatName: args.formatName ?? DEFAULT_RETRO_FORMAT.name,
    ...(args.teamId ? { teamId: args.teamId } : {}),
  });

const joinRoom = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/**
 * Lets any runAfter(0) continuation of the room cascade fire: convex-test
 * dispatches it through a real 0ms setTimeout.
 */
async function drainScheduled(t: T): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 5));
    await t.finishInProgressScheduledFunctions();
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    if (!jobs.some((j) => j.state.kind === "pending")) return;
  }
  throw new Error("scheduled functions did not drain");
}

/** A Team with an admin and a member, the admin's defaults customised. */
async function seedTeam(t: T) {
  const adminId = await seedUser(t, "admin", "permanent");
  const memberId = await seedUser(t, "member", "permanent");
  const teamId = await createTeam(t, "admin", "Acme Squad");
  await joinTeam(t, teamId, "member");
  await as(t, "admin").mutation(api.teams.updateRetroDefaults, {
    teamId,
    retroDefaults: CUSTOM_DEFAULTS,
  });
  return { teamId, adminId, memberId };
}

describe("retro.create — a team retro", () => {
  it("copies the Team's defaults by value, sets teamId and retained, and keeps review", async () => {
    const t = convexTest(schema, modules);
    const { teamId, memberId } = await seedTeam(t);

    const roomId = await createRetro(t, "member", { teamId, name: "Sprint 12" });

    const room = (await t.run((ctx) => ctx.db.get(roomId)))!;
    expect(room).toMatchObject({
      roomType: "retro",
      ownerId: memberId,
      teamId,
      retained: true,
      joinPolicy: "teamMembers",
      permissions: CUSTOM_DEFAULTS.permissions,
    });
    const retro = (await retroRow(t, roomId))!;
    expect(retro.attribution).toBe("anonymous");
    expect(retro.stages.map((s) => s.kind)).toEqual([
      "collect", "review", "group", "vote", "discuss", "close",
    ]);
    expect((await membershipsOf(t, roomId))[0]).toMatchObject({ userId: memberId, role: "owner" });
  });

  it("editing the Team's defaults afterwards changes nothing on the retro", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const roomId = await createRetro(t, "member", { teamId });

    await as(t, "admin").mutation(api.teams.updateRetroDefaults, {
      teamId,
      retroDefaults: {
        attribution: "named",
        joinPolicy: "anyone",
        permissions: { ...DEFAULT_RETRO_PERMISSIONS, stageFlow: "everyone" },
      },
    });

    const room = (await t.run((ctx) => ctx.db.get(roomId)))!;
    expect(room.joinPolicy).toBe("teamMembers");
    expect(room.permissions).toEqual(CUSTOM_DEFAULTS.permissions);
    expect((await retroRow(t, roomId))!.attribution).toBe("anonymous");
  });

  it("is refused for someone outside the Team, and no room is written", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    await seedUser(t, "stranger", "permanent");

    await expect(createRetro(t, "stranger", { teamId })).rejects.toThrow(
      "You are not a member of this team"
    );
    expect(await t.run((ctx) => ctx.db.query("rooms").collect())).toEqual([]);
  });
});

describe("retro.adoptIntoTeam", () => {
  async function seedTeamlessRetroWithActions(t: T) {
    const { teamId, adminId, memberId } = await seedTeam(t);
    const roomId = await createRetro(t, "member");
    const actionIds = await t.run(async (ctx) => {
      const now = Date.now();
      const ids: Id<"retroActions">[] = [];
      for (const text of ["a", "b"]) {
        ids.push(
          await ctx.db.insert("retroActions", {
            roomId,
            text,
            status: "open",
            createdBy: memberId,
            createdAt: now,
            updatedAt: now,
          })
        );
      }
      return ids;
    });
    return { teamId, adminId, memberId, roomId, actionIds };
  }

  it("the owner who is in the Team sets teamId and retained and stamps the action rows", async () => {
    const t = convexTest(schema, modules);
    const { teamId, roomId, actionIds } = await seedTeamlessRetroWithActions(t);
    const before = (await t.run((ctx) => ctx.db.get(roomId)))!;
    const retroBefore = (await retroRow(t, roomId))!;

    await as(t, "member").mutation(api.retro.adoptIntoTeam, { roomId, teamId });

    const room = (await t.run((ctx) => ctx.db.get(roomId)))!;
    expect(room.teamId).toBe(teamId);
    expect(room.retained).toBe(true);
    // Never rewritten: join policy, permissions (the teamless values stay).
    expect(room.joinPolicy).toBe(before.joinPolicy);
    expect(room.permissions).toEqual(before.permissions);
    const retro = (await retroRow(t, roomId))!;
    expect(retro.attribution).toBe(retroBefore.attribution);
    expect(retro.stages).toEqual(retroBefore.stages);
    expect(retro.stages.some((s) => s.kind === "review")).toBe(false);
    for (const id of actionIds) {
      expect((await t.run((ctx) => ctx.db.get(id)))?.teamId).toBe(teamId);
    }
  });

  it("is refused for a non-owner attendee, for an owner outside the Team, and a second time", async () => {
    const t = convexTest(schema, modules);
    const { teamId, roomId } = await seedTeamlessRetroWithActions(t);
    await seedUser(t, "outsider", "permanent");
    const outsiderRoomId = await createRetro(t, "outsider");
    await joinRoom(t, roomId, "admin");

    await expect(
      as(t, "admin").mutation(api.retro.adoptIntoTeam, { roomId, teamId })
    ).rejects.toThrow("Only the room owner can give this retro to a team.");
    await expect(
      as(t, "outsider").mutation(api.retro.adoptIntoTeam, { roomId: outsiderRoomId, teamId })
    ).rejects.toThrow("You are not a member of this team");

    await as(t, "member").mutation(api.retro.adoptIntoTeam, { roomId, teamId });
    const otherTeam = await createTeam(t, "member", "Beta");
    await expect(
      as(t, "member").mutation(api.retro.adoptIntoTeam, { roomId, teamId: otherTeam })
    ).rejects.toThrow("This retro already belongs to a team.");
    expect((await t.run((ctx) => ctx.db.get(roomId)))?.teamId).toBe(teamId);
  });

  it("an adopted retro survives the sweep a teamless one falls to", async () => {
    const t = convexTest(schema, modules);
    const { teamId, roomId } = await seedTeamlessRetroWithActions(t);
    const loose = await createRetro(t, "member");
    await as(t, "member").mutation(api.retro.adoptIntoTeam, { roomId, teamId });
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.patch(roomId, { lastActivityAt: tenDaysAgo });
      await ctx.db.patch(loose, { lastActivityAt: tenDaysAgo });
    });

    expect((await t.mutation(internal.cleanup.removeInactiveRooms, {})).roomsScheduled).toBe(1);
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.map((j) => (j.args as [{ roomId: string }])[0].roomId)).toEqual([loose]);
  });
});

describe("retro.claim (ADR-0013)", () => {
  async function seedTeamRetro(t: T) {
    const seeded = await seedTeam(t);
    const roomId = await createRetro(t, "member", { teamId: seeded.teamId });
    await joinRoom(t, roomId, "admin");
    return { ...seeded, roomId };
  }

  it("is denied with owner-present while the owner is here and in the Team", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedTeamRetro(t);

    await expect(as(t, "admin").mutation(api.retro.claim, { roomId })).rejects.toThrow(
      "The owner is still here — ask them to transfer ownership."
    );
  });

  it("succeeds once the owner has left the room: the admin owns it", async () => {
    const t = convexTest(schema, modules);
    const { roomId, adminId, memberId } = await seedTeamRetro(t);
    await as(t, "member").mutation(api.users.leave, { roomId, userId: memberId });

    await as(t, "admin").mutation(api.retro.claim, { roomId });

    expect((await t.run((ctx) => ctx.db.get(roomId)))?.ownerId).toBe(adminId);
    expect((await membershipOf(t, roomId, adminId))?.role).toBe("owner");
  });

  it("succeeds once the owner has left the Team: the previous owner becomes a participant", async () => {
    const t = convexTest(schema, modules);
    const { roomId, adminId, memberId, teamId } = await seedTeamRetro(t);
    await as(t, "admin").mutation(api.teams.removeMember, { teamId, targetUserId: memberId });

    await as(t, "admin").mutation(api.retro.claim, { roomId });

    expect((await t.run((ctx) => ctx.db.get(roomId)))?.ownerId).toBe(adminId);
    expect((await membershipOf(t, roomId, adminId))?.role).toBe("owner");
    expect((await membershipOf(t, roomId, memberId))?.role).toBe("participant");
    const owners = (await membershipsOf(t, roomId)).filter((m) => m.role === "owner");
    expect(owners).toHaveLength(1);
  });

  it("is denied to a team member who is not an admin, and to anyone in a teamless retro", async () => {
    const t = convexTest(schema, modules);
    const { roomId, teamId, memberId } = await seedTeamRetro(t);
    await seedUser(t, "second", "permanent");
    await joinTeam(t, teamId, "second");
    await joinRoom(t, roomId, "second");
    await as(t, "member").mutation(api.users.leave, { roomId, userId: memberId });

    await expect(as(t, "second").mutation(api.retro.claim, { roomId })).rejects.toThrow(
      "Only a team admin can claim this room."
    );

    const teamless = await createRetro(t, "member");
    await joinRoom(t, teamless, "admin");
    await as(t, "member").mutation(api.users.leave, { roomId: teamless, userId: memberId });
    await expect(as(t, "admin").mutation(api.retro.claim, { roomId: teamless })).rejects.toThrow(
      "Only a team admin can claim this room."
    );
  });

  it("requires attendance: an admin who never joined cannot claim", async () => {
    const t = convexTest(schema, modules);
    const { teamId, memberId } = await seedTeam(t);
    const roomId = await createRetro(t, "member", { teamId });
    await as(t, "member").mutation(api.users.leave, { roomId, userId: memberId });

    await expect(as(t, "admin").mutation(api.retro.claim, { roomId })).rejects.toThrow(
      "Not a member of this room"
    );
  });
});

describe("retro.remove — delete through the cascade (ADR-0019)", () => {
  async function seedRetroWithContent(t: T, teamId?: Id<"teams">) {
    const roomId = await createRetro(t, "member", teamId ? { teamId } : {});
    const memberId = (await t.run((ctx) => ctx.db.get(roomId)))!.ownerId!;
    await t.run(async (ctx) => {
      const now = Date.now();
      const clusterId = await ctx.db.insert("retroClusters", { roomId, name: "c", createdAt: now });
      const cardId = await ctx.db.insert("retroCards", {
        roomId,
        clientId: "k1",
        text: "hi",
        promptId: "p1",
        position: { x: 0, y: 0 },
        authorId: memberId,
        clusterId,
        createdAt: now,
        updatedAt: now,
        committedAt: now,
      });
      await ctx.db.insert("retroCards", {
        roomId,
        clientId: "k2",
        text: "hey",
        promptId: "p1",
        position: { x: 1, y: 1 },
        authorId: memberId,
        createdAt: now,
        updatedAt: now,
        committedAt: now,
      });
      await ctx.db.insert("retroVotes", {
        roomId,
        stageEntryId: "s",
        voterId: memberId,
        target: { kind: "card", id: cardId },
      });
      for (const status of ["open", "open", "done"] as const) {
        await ctx.db.insert("retroActions", {
          roomId,
          text: status,
          status,
          createdBy: memberId,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    return { roomId, memberId };
  }

  async function retroRowCounts(t: T, roomId: Id<"rooms">) {
    return t.run(async (ctx) => {
      const counts: Record<string, number> = {};
      for (const table of RETRO_TABLES) {
        counts[table] = (
          await ctx.db.query(table).withIndex("by_room", (q) => q.eq("roomId", roomId)).collect()
        ).length;
      }
      return counts;
    });
  }

  it("deleteCounts reads the card and open-action counts for the confirmation", async () => {
    const t = convexTest(schema, modules);
    await seedTeam(t);
    const { roomId } = await seedRetroWithContent(t);

    expect(await as(t, "member").query(api.retro.deleteCounts, { roomId })).toEqual({
      cards: 2,
      openActions: 2,
    });
    await seedUser(t, "stranger");
    await expect(as(t, "stranger").query(api.retro.deleteCounts, { roomId })).rejects.toThrow(
      "You don't have access to this room"
    );
  });

  it("the owner deletes; every retro table and the room are emptied", async () => {
    const t = convexTest(schema, modules);
    await seedTeam(t);
    const { roomId } = await seedRetroWithContent(t);
    expect((await retroRowCounts(t, roomId)).retroCards).toBe(2);

    await as(t, "member").mutation(api.retro.remove, { roomId });
    await drainScheduled(t);

    expect(await t.run((ctx) => ctx.db.get(roomId))).toBeNull();
    expect(Object.values(await retroRowCounts(t, roomId)).every((n) => n === 0)).toBe(true);
    expect(await membershipsOf(t, roomId)).toEqual([]);
  });

  it("refuses to delete a poker room through the retro door", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "owner");
    const pokerId = await as(t, "owner").mutation(api.rooms.create, { name: "P" });
    await joinRoom(t, pokerId, "owner");

    await expect(as(t, "owner").mutation(api.retro.remove, { roomId: pokerId })).rejects.toThrow(
      "This room is not a retro"
    );
    expect(await t.run((ctx) => ctx.db.get(pokerId))).not.toBeNull();
  });

  it("a non-owner cannot delete; a team admin cannot while the owner is present, and can after claim", async () => {
    const t = convexTest(schema, modules);
    const { teamId, memberId } = await seedTeam(t);
    const { roomId } = await seedRetroWithContent(t, teamId);
    await joinRoom(t, roomId, "admin");

    await expect(as(t, "admin").mutation(api.retro.remove, { roomId })).rejects.toThrow(
      "Only the owner can do this."
    );
    await as(t, "member").mutation(api.users.leave, { roomId, userId: memberId });
    await expect(as(t, "admin").mutation(api.retro.remove, { roomId })).rejects.toThrow(
      "Room owner has left."
    );

    await as(t, "admin").mutation(api.retro.claim, { roomId });
    await as(t, "admin").mutation(api.retro.remove, { roomId });
    await drainScheduled(t);
    expect(await t.run((ctx) => ctx.db.get(roomId))).toBeNull();
  });
});

describe("joining a team retro (spec §4.4)", () => {
  it("teamMembers refuses a permanent non-member with the team's name, and admits a Team member", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const roomId = await createRetro(t, "member", { teamId });
    await seedUser(t, "perm", "permanent");

    await expect(joinRoom(t, roomId, "perm")).rejects.toThrow(
      "This retro is for members of Acme Squad. Ask an admin for the invite link."
    );
    expect(await membershipsOf(t, roomId)).toHaveLength(1);

    await joinRoom(t, roomId, "admin");
    expect(await membershipsOf(t, roomId)).toHaveLength(2);
  });

  it("permanentAccounts refuses an anonymous account on a team retro too", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const roomId = await createRetro(t, "member", { teamId });
    await t.run((ctx) => ctx.db.patch(roomId, { joinPolicy: "permanentAccounts" }));
    await seedUser(t, "anon", "anonymous");

    await expect(joinRoom(t, roomId, "anon")).rejects.toThrow(
      "This retro is for signed-in accounts. Sign in to join."
    );
  });
});

describe("reading a team retro without attendance (ADR-0009)", () => {
  it("a Team member who never joined reads the board and no membership row is written", async () => {
    const t = convexTest(schema, modules);
    const { teamId, adminId } = await seedTeam(t);
    const roomId = await createRetro(t, "member", { teamId });

    const board = await as(t, "admin").query(api.retro.board, { roomId });
    expect(board.retro.roomId).toBe(roomId);
    expect(await membershipOf(t, roomId, adminId)).toBeNull();
    expect(await as(t, "admin").query(api.users.getMyMembership, { roomId })).toBeNull();
  });

  it("remove ends attendance, not access: a removed Team member still reads", async () => {
    const t = convexTest(schema, modules);
    const { teamId, adminId } = await seedTeam(t);
    const roomId = await createRetro(t, "member", { teamId });
    await joinRoom(t, roomId, "admin");

    await as(t, "member").mutation(api.users.remove, { roomId, userId: adminId });

    expect(await membershipOf(t, roomId, adminId)).toBeNull();
    expect((await as(t, "admin").query(api.retro.board, { roomId })).retro.roomId).toBe(roomId);
  });

  it("the room shell names the owning Team for anyone with the link", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const roomId = await createRetro(t, "member", { teamId });
    const teamless = await createRetro(t, "member");

    const shell = (await t.query(api.rooms.get, { roomId }))!;
    expect(shell.teamName).toBe("Acme Squad");
    expect(shell.room.joinPolicy).toBe("teamMembers");
    expect((await t.query(api.rooms.get, { roomId: teamless }))!.teamName).toBeUndefined();
  });
});

describe("retro.lastFormat — the create form's pre-selection", () => {
  it("is null for a Team without retros, then the newest retro's format", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);

    expect(await as(t, "member").query(api.retro.lastFormat, { teamId })).toBeNull();

    await createRetro(t, "member", { teamId, formatName: "Sailboat" });
    await createRetro(t, "admin", { teamId, formatName: "Lean Coffee" });

    const format = await as(t, "member").query(api.retro.lastFormat, { teamId });
    expect(format?.name).toBe("Lean Coffee");
    expect(format?.prompts).toEqual(RETRO_FORMATS.find((f) => f.name === "Lean Coffee")!.prompts);

    await seedUser(t, "stranger", "permanent");
    await expect(as(t, "stranger").query(api.retro.lastFormat, { teamId })).rejects.toThrow(
      "You are not a member of this team"
    );
  });
});

describe("listings (spec §16.5, §18.1)", () => {
  async function advanceTo(t: T, roomId: Id<"rooms">, kind: "group" | "close") {
    await t.run(async (ctx) => {
      const retro = (await ctx.db
        .query("retros")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .unique())!;
      await ctx.db.patch(retro._id, {
        currentStageId: retro.stages.find((s) => s.kind === kind)!.id,
      });
    });
  }

  it("the team page lists the Team's retros in creation order with their resting stage", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const first = await createRetro(t, "member", { teamId, name: "First" });
    const second = await createRetro(t, "admin", { teamId, name: "Second" });
    await createRetro(t, "member", { name: "Teamless" });
    await advanceTo(t, first, "close");

    const rows = await as(t, "member").query(api.retro.listForTeam, { teamId });
    expect(rows.map((r) => [r.roomId, r.name, r.stageKind])).toEqual([
      [first, "First", "close"],
      [second, "Second", "collect"],
    ]);
    await seedUser(t, "stranger", "permanent");
    await expect(as(t, "stranger").query(api.retro.listForTeam, { teamId })).rejects.toThrow(
      "You are not a member of this team"
    );
  });

  it("the dashboard lists attended retros, collect first, grouped by Team, teamless under No team", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const beta = await createTeam(t, "member", "Beta");
    const acmeOld = await createRetro(t, "member", { teamId, name: "Acme old" });
    const acmeCollecting = await createRetro(t, "member", { teamId, name: "Acme collecting" });
    const betaRetro = await createRetro(t, "member", { teamId: beta, name: "Beta one" });
    const teamless = await createRetro(t, "member", { name: "Loose" });
    const notAttended = await createRetro(t, "admin", { teamId, name: "Not mine" });
    await createRetro(t, "admin", { name: "Poker-less" });
    await as(t, "member").mutation(api.rooms.create, { name: "Poker" });
    await advanceTo(t, acmeOld, "group");
    await advanceTo(t, betaRetro, "close");

    const groups = await as(t, "member").query(api.retro.listMine, {});
    expect(groups.map((g) => g.teamName)).toEqual(["Acme Squad", "Beta", "No team"]);
    expect(groups[0].teamId).toBe(teamId);
    expect(groups[0].retros.map((r) => r.roomId)).toEqual([acmeCollecting, acmeOld]);
    expect(groups[0].retros.map((r) => r.stageKind)).toEqual(["collect", "group"]);
    expect(groups[1].retros.map((r) => r.roomId)).toEqual([betaRetro]);
    expect(groups[2].teamId).toBeUndefined();
    expect(groups[2].retros.map((r) => r.roomId)).toEqual([teamless]);
    expect(groups.flatMap((g) => g.retros.map((r) => r.roomId))).not.toContain(notAttended);
  });

  it("a retro of a Team the person left keeps its Team's name but loses the door to the team page", async () => {
    const t = convexTest(schema, modules);
    const { teamId, memberId } = await seedTeam(t);
    const roomId = await createRetro(t, "member", { teamId });
    await as(t, "admin").mutation(api.teams.removeMember, { teamId, targetUserId: memberId });

    const groups = await as(t, "member").query(api.retro.listMine, {});
    expect(groups).toHaveLength(1);
    expect(groups[0].teamName).toBe("Acme Squad");
    expect(groups[0].teamId).toBeUndefined();
    expect(groups[0].retros.map((r) => r.roomId)).toEqual([roomId]);
  });

  it("a named collect retro tells the viewer they have not added a card yet; anonymous and other stages never do", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "permanent");
    const memberId = await seedUser(t, "member", "permanent");
    const teamId = await createTeam(t, "admin", "Acme Squad");
    await joinTeam(t, teamId, "member");
    const named = await createRetro(t, "admin", { teamId, name: "Named" });
    const grouped = await createRetro(t, "admin", { teamId, name: "Grouped" });
    await advanceTo(t, grouped, "group");
    await as(t, "admin").mutation(api.teams.updateRetroDefaults, {
      teamId,
      retroDefaults: { ...CUSTOM_DEFAULTS, attribution: "anonymous", joinPolicy: "anyone" },
    });
    const anonymous = await createRetro(t, "admin", { teamId, name: "Anonymous" });
    await joinRoom(t, named, "member");
    await joinRoom(t, anonymous, "member");
    void adminId;
    void memberId;

    const hintOf = (rows: { roomId: Id<"rooms">; noCardYet?: true }[]) =>
      Object.fromEntries(rows.map((r) => [r.roomId, r.noCardYet ?? false]));

    // The team page, from the member's seat: only the named collect retro hints.
    expect(hintOf(await as(t, "member").query(api.retro.listForTeam, { teamId }))).toEqual({
      [named]: true,
      [grouped]: false,
      [anonymous]: false,
    });
    // The dashboard, same rule.
    const groups = await as(t, "member").query(api.retro.listMine, {});
    expect(hintOf(groups[0].retros)).toEqual({ [named]: true, [anonymous]: false });

    // Writing a card clears it for the writer alone.
    const retro = (await retroRow(t, named))!;
    await as(t, "member").mutation(api.retro.createCard, {
      roomId: named,
      clientId: "c1",
      text: "x",
      promptId: retro.format.prompts[0].id,
      position: { x: 0, y: 0 },
    });
    expect(hintOf(await as(t, "member").query(api.retro.listForTeam, { teamId }))[named]).toBe(false);
    expect(hintOf(await as(t, "admin").query(api.retro.listForTeam, { teamId }))[named]).toBe(true);
  });

  it("the dashboard is empty for an anonymous visitor and for someone who attended nothing", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "nobody");
    expect(await t.query(api.retro.listMine, {})).toEqual([]);
    expect(await as(t, "nobody").query(api.retro.listMine, {})).toEqual([]);
  });
});
