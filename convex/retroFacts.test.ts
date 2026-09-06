/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { DEFAULT_RETRO_PERMISSIONS } from "./permissions";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// Retro facts (spec §17, ADR-0024): a history row holds what the retros
// row and the action index store and nothing that measures the team; the
// team page carries one count line. Every number is a fact with a unit.

const modules = import.meta.glob("./**/*.*s");

const seedUser = (t: T, authUserId: string, accountType?: "anonymous" | "permanent") =>
  seedNamedUser(t, authUserId, authUserId, accountType);
const as = (t: T, subject: string) => t.withIdentity({ subject });

async function retroRow(t: T, roomId: Id<"rooms">) {
  return (await t.run((ctx) =>
    ctx.db
      .query("retros")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .unique()
  ))!;
}

/** A Team with an admin and a member, both permanent accounts. */
async function seedTeam(t: T) {
  const adminId = await seedUser(t, "admin", "permanent");
  const memberId = await seedUser(t, "member", "permanent");
  const teamId = await as(t, "admin").mutation(api.teams.create, { name: "Acme" });
  const team = (await t.run((ctx) => ctx.db.get(teamId)))!;
  await as(t, "member").mutation(api.teams.joinByInvite, { inviteToken: team.inviteToken });
  return { teamId, adminId, memberId };
}

const createRetro = (t: T, subject: string, args: { teamId?: Id<"teams">; name?: string } = {}) =>
  as(t, subject).mutation(api.retro.create, {
    name: args.name ?? "R",
    formatName: DEFAULT_RETRO_FORMAT.name,
    ...(args.teamId ? { teamId: args.teamId } : {}),
  });

const joinRoom = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/** The Team's retro with the actor's helpers: write a card, create an action, set its status, advance. */
async function seedTeamRetro(t: T, teamId: Id<"teams">, name = "Sprint 42") {
  const roomId = await createRetro(t, "admin", { teamId, name });
  await joinRoom(t, roomId, "member");
  const retro = await retroRow(t, roomId);
  const byKind = (kind: string) => retro.stages.find((s) => s.kind === kind)!;
  const advance = (kind: string) => as(t, "admin").mutation(api.retro.advance, { roomId, toStageId: byKind(kind).id });
  const write = (who: string, clientId: string) =>
    as(t, who).mutation(api.retro.createCard, {
      roomId,
      clientId,
      text: clientId,
      promptId: retro.format.prompts[0].id,
      position: { x: 0, y: 0 },
    });
  const action = (who: string, text: string) => as(t, who).mutation(api.retro.createAction, { roomId, text });
  const setStatus = (who: string, actionId: Id<"retroActions">, status: "open" | "done" | "dropped") =>
    as(t, who).mutation(api.retro.setActionStatus, { roomId, actionId, status });
  return { roomId, retro, byKind, advance, write, action, setStatus };
}

const rowOf = async (t: T, teamId: Id<"teams">, roomId: Id<"rooms">) =>
  (await as(t, "member").query(api.retro.listForTeam, { teamId })).find((r) => r.roomId === roomId)!;

describe("the history row (spec §17)", () => {
  it("carries name, created date, format name, attribution, resting stage and zero counts for a fresh retro, and nothing more", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const { roomId } = await seedTeamRetro(t, teamId);
    const room = (await t.run((ctx) => ctx.db.get(roomId)))!;

    const row = await rowOf(t, teamId, roomId);
    expect(row).toEqual({
      roomId,
      name: "Sprint 42",
      createdAt: room.createdAt,
      formatName: DEFAULT_RETRO_FORMAT.name,
      attribution: "named",
      stageKind: "collect",
      counts: { open: 0, done: 0, dropped: 0 },
      noCardYet: true,
    });
  });

  it("counts this retro's action items by status; a status change moves a count and a card written changes nothing", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const { roomId, action, setStatus, write } = await seedTeamRetro(t, teamId);
    const a = await action("admin", "A");
    const b = await action("member", "B");
    await action("member", "C");
    await setStatus("admin", a, "done");
    await setStatus("member", b, "dropped");

    expect((await rowOf(t, teamId, roomId)).counts).toEqual({ open: 1, done: 1, dropped: 1 });

    await write("member", "c1");
    await write("admin", "c2");
    expect((await rowOf(t, teamId, roomId)).counts).toEqual({ open: 1, done: 1, dropped: 1 });

    await setStatus("admin", a, "open");
    expect((await rowOf(t, teamId, roomId)).counts).toEqual({ open: 2, done: 0, dropped: 1 });
  });

  it("reads the coverage facts from the stored walk once one exists, and the resting stage", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const { roomId, byKind, advance, write } = await seedTeamRetro(t, teamId);
    await write("admin", "c1");
    await write("member", "c2");
    await write("member", "c3");
    expect((await rowOf(t, teamId, roomId)).coverage).toBeUndefined();

    await advance("discuss");
    const walk = (await retroRow(t, roomId)).walk!;
    await as(t, "admin").mutation(api.retro.markCovered, { roomId, topicId: walk.order[0].id, covered: true });
    await advance("close");

    const row = await rowOf(t, teamId, roomId);
    expect(row.stageKind).toBe("close");
    expect(row.coverage).toEqual({ covered: 1, total: 3 });
    expect(row.noCardYet).toBeUndefined();
    void byKind;
  });

  it("the dashboard's rows carry the same fields", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const { roomId, action, setStatus } = await seedTeamRetro(t, teamId);
    await setStatus("admin", await action("admin", "A"), "done");

    const groups = await as(t, "member").query(api.retro.listMine, {});
    const row = groups[0].retros.find((r) => r.roomId === roomId)!;
    expect(row.formatName).toBe(DEFAULT_RETRO_FORMAT.name);
    expect(row.attribution).toBe("named");
    expect(row.counts).toEqual({ open: 0, done: 1, dropped: 0 });
  });
});

describe("the team count line (spec §17)", () => {
  it("sums the Team's action items by status and counts its rooms, the same for admin and member", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const first = await seedTeamRetro(t, teamId, "First");
    const second = await seedTeamRetro(t, teamId, "Second");
    await createRetro(t, "member", { name: "Teamless" });
    await first.setStatus("admin", await first.action("admin", "A"), "done");
    await first.action("member", "B");
    await second.setStatus("member", await second.action("member", "C"), "dropped");
    await second.action("admin", "D");
    await second.action("admin", "E");

    const facts = { open: 3, done: 1, dropped: 1, retros: 2 };
    expect(await as(t, "member").query(api.teams.facts, { teamId })).toEqual(facts);
    expect(await as(t, "admin").query(api.teams.facts, { teamId })).toEqual(facts);
  });

  it("is refused to anyone outside the Team", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    await seedUser(t, "stranger", "permanent");
    await expect(as(t, "stranger").query(api.teams.facts, { teamId })).rejects.toThrow(
      "You are not a member of this team"
    );
    await expect(t.query(api.teams.facts, { teamId })).rejects.toThrow("Not authenticated");
    void DEFAULT_RETRO_PERMISSIONS;
  });
});
