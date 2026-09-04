/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_PERMISSIONS } from "./permissions";
import { type T } from "./analytics.seeds";
import * as Teams from "./model/teams";

// Teams (ADR-0008, spec §5): the permanent visibility boundary. Every team
// action goes through `api.teams.*`, guarded by `requireTeamRole`; a Team
// membership is held by permanent accounts only and is written by the invite
// route and nowhere else.

const modules = import.meta.glob("./**/*.*s");

async function seedUser(
  t: T,
  authUserId: string,
  accountType?: "anonymous" | "permanent"
): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId,
      name: authUserId,
      createdAt: Date.now(),
      ...(accountType ? { accountType } : {}),
    })
  );
}

const as = (t: T, subject: string) => t.withIdentity({ subject });

async function memberships(t: T, teamId: Id<"teams">) {
  return t.run((ctx) =>
    ctx.db
      .query("teamMemberships")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect()
  );
}

describe("teams.create", () => {
  it("a permanent account creates a Team, becomes admin, and gets the default retro defaults", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "perm", "permanent");

    const teamId = await as(t, "perm").mutation(api.teams.create, { name: "Acme Squad" });

    const team = await t.run((ctx) => ctx.db.get(teamId));
    expect(team?.name).toBe("Acme Squad");
    expect(team?.inviteToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(team?.retroDefaults).toEqual({
      attribution: "named",
      joinPolicy: "anyone",
      permissions: DEFAULT_RETRO_PERMISSIONS,
    });

    const rows = await memberships(t, teamId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId, role: "admin" });
  });

  it("an anonymous account, and one whose account type is undefined, are refused", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "anon", "anonymous");
    await seedUser(t, "undef");

    await expect(
      as(t, "anon").mutation(api.teams.create, { name: "A" })
    ).rejects.toThrow("Sign in to create a team");
    await expect(
      as(t, "undef").mutation(api.teams.create, { name: "A" })
    ).rejects.toThrow("Sign in to create a team");
    expect(await t.run((ctx) => ctx.db.query("teams").collect())).toEqual([]);
  });

  it("a blank name is refused", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "perm", "permanent");
    await expect(
      as(t, "perm").mutation(api.teams.create, { name: "   " })
    ).rejects.toThrow("Team name cannot be empty");
  });
});

async function createTeam(t: T, subject: string, name = "Acme"): Promise<Id<"teams">> {
  return as(t, subject).mutation(api.teams.create, { name });
}

async function inviteToken(t: T, teamId: Id<"teams">): Promise<string> {
  const team = await t.run((ctx) => ctx.db.get(teamId));
  return team!.inviteToken;
}

describe("the invite link", () => {
  it("resolves to the team's name for anyone holding it, and to null when stale", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "admin", "permanent");
    const teamId = await createTeam(t, "admin", "Acme Squad");
    const token = await inviteToken(t, teamId);

    expect(await t.query(api.teams.getByInviteToken, { inviteToken: token })).toEqual({
      _id: teamId,
      name: "Acme Squad",
    });
    expect(await t.query(api.teams.getByInviteToken, { inviteToken: "nope" })).toBeNull();
  });

  it("makes a permanent account a member, once", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "admin", "permanent");
    const joinerId = await seedUser(t, "joiner", "permanent");
    const teamId = await createTeam(t, "admin");
    const token = await inviteToken(t, teamId);

    const joined = await as(t, "joiner").mutation(api.teams.joinByInvite, { inviteToken: token });
    expect(joined).toBe(teamId);
    await as(t, "joiner").mutation(api.teams.joinByInvite, { inviteToken: token });

    const rows = await memberships(t, teamId);
    expect(rows.filter((m) => m.userId === joinerId)).toHaveLength(1);
    expect(rows.find((m) => m.userId === joinerId)?.role).toBe("member");
  });

  it("refuses an anonymous or undefined-type account with the sign-in copy", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "admin", "permanent");
    await seedUser(t, "anon", "anonymous");
    await seedUser(t, "undef");
    const teamId = await createTeam(t, "admin", "Acme Squad");
    const token = await inviteToken(t, teamId);

    await expect(
      as(t, "anon").mutation(api.teams.joinByInvite, { inviteToken: token })
    ).rejects.toThrow("Sign in to join Acme Squad");
    await expect(
      as(t, "undef").mutation(api.teams.joinByInvite, { inviteToken: token })
    ).rejects.toThrow("Sign in to join Acme Squad");
    expect(await memberships(t, teamId)).toHaveLength(1);
  });

  it("refuses a stale token", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "joiner", "permanent");
    await expect(
      as(t, "joiner").mutation(api.teams.joinByInvite, { inviteToken: "stale" })
    ).rejects.toThrow("This invite link is no longer valid");
  });

  it("an admin rotates the token to a fresh value, which invalidates the old link; a member cannot", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "admin", "permanent");
    await seedUser(t, "member", "permanent");
    await seedUser(t, "late", "permanent");
    const teamId = await createTeam(t, "admin");
    const oldToken = await inviteToken(t, teamId);
    await as(t, "member").mutation(api.teams.joinByInvite, { inviteToken: oldToken });

    await expect(
      as(t, "member").mutation(api.teams.rotateInvite, { teamId })
    ).rejects.toThrow("Only a team admin can do that");

    await as(t, "admin").mutation(api.teams.rotateInvite, { teamId });
    const newToken = await inviteToken(t, teamId);
    expect(newToken).not.toBe(oldToken);
    expect(newToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    await expect(
      as(t, "late").mutation(api.teams.joinByInvite, { inviteToken: oldToken })
    ).rejects.toThrow("This invite link is no longer valid");
    await as(t, "late").mutation(api.teams.joinByInvite, { inviteToken: newToken });
    expect(await memberships(t, teamId)).toHaveLength(3);
  });

  it("joining a room the Team owns never creates a team membership", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "admin", "permanent");
    const teamId = await createTeam(t, "admin");
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

    await as(t, "guest").mutation(api.users.join, {
      roomId,
      authUserId: "guest",
      name: "Guest",
    });

    const roomRows = await t.run((ctx) =>
      ctx.db.query("roomMemberships").withIndex("by_room", (q) => q.eq("roomId", roomId)).collect()
    );
    expect(roomRows).toHaveLength(1);
    expect(await memberships(t, teamId)).toHaveLength(1);
  });
});

/** A team with one admin and one member, both permanent. */
async function seedTeamWithMember(t: T) {
  const adminId = await seedUser(t, "admin", "permanent");
  const memberId = await seedUser(t, "member", "permanent");
  const teamId = await createTeam(t, "admin", "Acme");
  await as(t, "member").mutation(api.teams.joinByInvite, { inviteToken: await inviteToken(t, teamId) });
  return { adminId, memberId, teamId };
}

async function roleOf(t: T, teamId: Id<"teams">, userId: Id<"users">) {
  const rows = await memberships(t, teamId);
  return rows.find((m) => m.userId === userId)?.role ?? null;
}

describe("roles", () => {
  it("an admin renames the team; a member cannot", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamWithMember(t);

    await expect(
      as(t, "member").mutation(api.teams.rename, { teamId, name: "Nope" })
    ).rejects.toThrow("Only a team admin can do that");
    await as(t, "admin").mutation(api.teams.rename, { teamId, name: "  Beta Crew " });
    expect((await t.run((ctx) => ctx.db.get(teamId)))?.name).toBe("Beta Crew");
  });

  it("an admin promotes a member and demotes an admin; a member can do neither", async () => {
    const t = convexTest(schema, modules);
    const { adminId, memberId, teamId } = await seedTeamWithMember(t);

    await expect(
      as(t, "member").mutation(api.teams.promote, { teamId, targetUserId: memberId })
    ).rejects.toThrow("Only a team admin can do that");

    await as(t, "admin").mutation(api.teams.promote, { teamId, targetUserId: memberId });
    expect(await roleOf(t, teamId, memberId)).toBe("admin");

    await as(t, "member").mutation(api.teams.demote, { teamId, targetUserId: adminId });
    expect(await roleOf(t, teamId, adminId)).toBe("member");
  });

  it("the last admin cannot be demoted", async () => {
    const t = convexTest(schema, modules);
    const { adminId, teamId } = await seedTeamWithMember(t);

    await expect(
      as(t, "admin").mutation(api.teams.demote, { teamId, targetUserId: adminId })
    ).rejects.toThrow("Make someone else an admin first, or delete the team.");
    expect(await roleOf(t, teamId, adminId)).toBe("admin");
  });

  it("the last admin cannot leave; a member can, and an admin can once another admin exists", async () => {
    const t = convexTest(schema, modules);
    const { adminId, memberId, teamId } = await seedTeamWithMember(t);

    await expect(as(t, "admin").mutation(api.teams.leave, { teamId })).rejects.toThrow(
      "Make someone else an admin first, or delete the team."
    );
    expect(await roleOf(t, teamId, adminId)).toBe("admin");

    await as(t, "admin").mutation(api.teams.promote, { teamId, targetUserId: memberId });
    await as(t, "admin").mutation(api.teams.leave, { teamId });
    expect(await roleOf(t, teamId, adminId)).toBeNull();
    expect(await roleOf(t, teamId, memberId)).toBe("admin");
  });

  it("removal deletes only the membership row: room attendance and the team's rooms survive", async () => {
    const t = convexTest(schema, modules);
    const { memberId, teamId } = await seedTeamWithMember(t);
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
    await t.run((ctx) =>
      ctx.db.insert("roomMemberships", { roomId, userId: memberId, isSpectator: false, joinedAt: Date.now() })
    );

    await expect(
      as(t, "member").mutation(api.teams.removeMember, { teamId, targetUserId: memberId })
    ).rejects.toThrow("Only a team admin can do that");

    await as(t, "admin").mutation(api.teams.removeMember, { teamId, targetUserId: memberId });

    expect(await roleOf(t, teamId, memberId)).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(roomId))).not.toBeNull();
    expect(
      await t.run((ctx) => ctx.db.query("roomMemberships").withIndex("by_room", (q) => q.eq("roomId", roomId)).collect())
    ).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(memberId))).not.toBeNull();
  });

  it("an admin cannot remove themselves through removeMember (leave is the route)", async () => {
    const t = convexTest(schema, modules);
    const { adminId, teamId } = await seedTeamWithMember(t);
    await expect(
      as(t, "admin").mutation(api.teams.removeMember, { teamId, targetUserId: adminId })
    ).rejects.toThrow("Leave the team instead");
  });

  it("acting on someone who is not a member is refused", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamWithMember(t);
    const strangerId = await seedUser(t, "stranger", "permanent");
    for (const fn of [api.teams.promote, api.teams.demote, api.teams.removeMember]) {
      await expect(
        as(t, "admin").mutation(fn, { teamId, targetUserId: strangerId })
      ).rejects.toThrow("Not a member of this team");
    }
  });

  it("an admin edits the retro-defaults bundle by value; a member cannot", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamWithMember(t);
    const bundle = {
      attribution: "anonymous" as const,
      joinPolicy: "teamMembers" as const,
      permissions: {
        stageFlow: "everyone" as const,
        cardManagement: "owner" as const,
        actionManagement: "facilitators" as const,
        retroSettings: "owner" as const,
      },
    };

    await expect(
      as(t, "member").mutation(api.teams.updateRetroDefaults, { teamId, retroDefaults: bundle })
    ).rejects.toThrow("Only a team admin can do that");
    await as(t, "admin").mutation(api.teams.updateRetroDefaults, { teamId, retroDefaults: bundle });
    expect((await t.run((ctx) => ctx.db.get(teamId)))?.retroDefaults).toEqual(bundle);
  });

  it("a non-member is refused everywhere, and a missing team reads as not found", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamWithMember(t);
    await seedUser(t, "stranger", "permanent");
    await expect(
      as(t, "stranger").mutation(api.teams.rename, { teamId, name: "X" })
    ).rejects.toThrow("You are not a member of this team");
    await expect(as(t, "stranger").mutation(api.teams.leave, { teamId })).rejects.toThrow(
      "You are not a member of this team"
    );
    await t.run((ctx) => ctx.db.delete(teamId));
    await expect(
      as(t, "admin").mutation(api.teams.rename, { teamId, name: "X" })
    ).rejects.toThrow("Team not found");
  });
});

async function seedTeamRoom(t: T, teamId: Id<"teams">, name = "Team retro"): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name,
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      retained: true,
      teamId,
    })
  );
}

async function scheduledJobs(t: T, suffix: string) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((j) => j.name.endsWith(suffix));
}

/** Drains runAfter(0) jobs (see roomAggregate.test.ts for why real timers). */
async function drainScheduled(t: T): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 5));
    await t.finishInProgressScheduledFunctions();
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    if (jobs.every((j) => j.state.kind !== "pending")) return;
  }
  throw new Error("scheduled functions did not drain");
}

describe("teams.remove (deletion)", () => {
  it("only an admin may delete", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamWithMember(t);
    await expect(as(t, "member").mutation(api.teams.remove, { teamId })).rejects.toThrow(
      "Only a team admin can do that"
    );
    expect(await t.run((ctx) => ctx.db.get(teamId))).not.toBeNull();
  });

  it("schedules exactly one room cascade per room the Team owns and none for other rooms", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamWithMember(t);
    const r1 = await seedTeamRoom(t, teamId, "one");
    const r2 = await seedTeamRoom(t, teamId, "two");
    await seedUser(t, "other", "permanent");
    const otherTeam = await createTeam(t, "other", "Other");
    const r3 = await seedTeamRoom(t, otherTeam, "theirs");
    const teamless = await t.run((ctx) =>
      ctx.db.insert("rooms", {
        name: "poker",
        autoCompleteVoting: false,
        isGameOver: false,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        retained: false,
      })
    );

    await as(t, "admin").mutation(api.teams.remove, { teamId });

    const cascades = await scheduledJobs(t, ":deleteRoomAggregateChunk");
    const roomIds = cascades.map((j) => (j.args as [{ roomId: string }])[0].roomId).sort();
    expect(roomIds).toEqual([r1, r2].sort());

    await drainScheduled(t);
    expect(await t.run((ctx) => ctx.db.get(r1))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(r2))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(r3))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(teamless))).not.toBeNull();
  });

  it("drains memberships in batches with a scheduled continuation and deletes the team row last", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamWithMember(t);
    // Well over one batch of memberships.
    await t.run(async (ctx) => {
      for (let i = 0; i < 12; i++) {
        const userId = await ctx.db.insert("users", {
          authUserId: `bulk-${i}`,
          name: `bulk-${i}`,
          accountType: "permanent",
          createdAt: Date.now(),
        });
        await ctx.db.insert("teamMemberships", { teamId, userId, role: "member", joinedAt: Date.now() });
      }
    });
    expect(await memberships(t, teamId)).toHaveLength(14);

    // Drive the model step directly with a small batch so the continuation
    // path is exercised without seeding hundreds of rows.
    const step1 = await t.run((ctx) => Teams.deleteTeamChunk(ctx, teamId, 5));
    expect(step1).toEqual({ done: false, deleted: 5 });
    expect(await memberships(t, teamId)).toHaveLength(9);
    expect(await t.run((ctx) => ctx.db.get(teamId))).not.toBeNull();

    const step2 = await t.run((ctx) => Teams.deleteTeamChunk(ctx, teamId, 5));
    expect(step2).toEqual({ done: false, deleted: 5 });
    const step3 = await t.run((ctx) => Teams.deleteTeamChunk(ctx, teamId, 5));
    expect(step3).toEqual({ done: true, deleted: 4 });
    expect(await memberships(t, teamId)).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.get(teamId))).toBeNull();

    // And the registered wrapper reschedules itself until done.
    const { teamId: t2 } = await (async () => {
      await seedUser(t, "admin2", "permanent");
      const id = await createTeam(t, "admin2", "Second");
      await t.run(async (ctx) => {
        for (let i = 0; i < Teams.TEAM_DELETE_BATCH_SIZE + 3; i++) {
          const userId = await ctx.db.insert("users", {
            authUserId: `b2-${i}`,
            name: `b2-${i}`,
            accountType: "permanent",
            createdAt: Date.now(),
          });
          await ctx.db.insert("teamMemberships", { teamId: id, userId, role: "member", joinedAt: Date.now() });
        }
      });
      return { teamId: id };
    })();
    await as(t, "admin2").mutation(api.teams.remove, { teamId: t2 });
    expect(await t.run((ctx) => ctx.db.get(t2))).not.toBeNull();
    expect(await scheduledJobs(t, ":deleteTeamChunk")).toHaveLength(1);
    await drainScheduled(t);
    expect(await memberships(t, t2)).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.get(t2))).toBeNull();
  });

  it("a small team deletes its memberships and row in the one mutation", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamWithMember(t);
    await as(t, "admin").mutation(api.teams.remove, { teamId });
    expect(await memberships(t, teamId)).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.get(teamId))).toBeNull();
    expect(await scheduledJobs(t, ":deleteTeamChunk")).toHaveLength(0);
  });
});

describe("team reads", () => {
  it("teams.get returns the members-only page data to a member and refuses a non-member", async () => {
    const t = convexTest(schema, modules);
    const { adminId, memberId, teamId } = await seedTeamWithMember(t);
    await seedUser(t, "stranger", "permanent");
    await seedTeamRoom(t, teamId);
    await seedTeamRoom(t, teamId);

    const page = await as(t, "member").query(api.teams.get, { teamId });
    expect(page.name).toBe("Acme");
    expect(page.inviteToken).toBe(await inviteToken(t, teamId));
    expect(page.myRole).toBe("member");
    expect(page.roomCount).toBe(2);
    expect(page.retroDefaults.attribution).toBe("named");
    expect(page.members.map((m) => [m.userId, m.name, m.role])).toEqual([
      [adminId, "admin", "admin"],
      [memberId, "member", "member"],
    ]);

    await expect(as(t, "stranger").query(api.teams.get, { teamId })).rejects.toThrow(
      "You are not a member of this team"
    );
  });

  it("teams.listMine lists the caller's Teams with their role, and nothing for an outsider", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeamWithMember(t);
    await seedUser(t, "stranger", "permanent");
    const second = await createTeam(t, "member", "Beta");

    const mine = await as(t, "member").query(api.teams.listMine, {});
    expect(mine.map((x) => [x._id, x.name, x.role])).toEqual([
      [teamId, "Acme", "member"],
      [second, "Beta", "admin"],
    ]);
    expect(await as(t, "stranger").query(api.teams.listMine, {})).toEqual([]);
  });
});
