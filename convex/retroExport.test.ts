/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";
import { FORMER_MEMBER, HIDDEN_CARD_LABEL, UNOWNED_ACTION } from "./retroCopy";

// Export (spec §15.3, §15.4, ADR-0019): a projection of read access and
// never more. Both exports run through `projectCard`, the attribution
// projection and the guards, so a hidden entry exports silhouettes, an
// anonymous retro has no authors, no export has voters, and only a reader
// (a room member or a Team member) gets one.

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

/** A Team with an admin and a member (permanent), and a stranger outside it. */
async function seedTeam(t: T) {
  const adminId = await seedUser(t, "admin", "permanent");
  const memberId = await seedUser(t, "member", "permanent");
  await seedUser(t, "stranger", "permanent");
  const teamId = await as(t, "admin").mutation(api.teams.create, { name: "Acme Squad" });
  const team = (await t.run((ctx) => ctx.db.get(teamId)))!;
  await as(t, "member").mutation(api.teams.joinByInvite, { inviteToken: team.inviteToken });
  return { teamId, adminId, memberId };
}

const joinRoom = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/**
 * A team retro created by the admin with a guest (anonymous account)
 * attending; the member of the Team never joins, so they read without
 * attendance (ADR-0009). Helpers write cards, group, dot, act and advance.
 */
async function seedRetro(t: T, teamId: Id<"teams">, name = "Sprint 42") {
  const roomId = await as(t, "admin").mutation(api.retro.create, {
    name,
    formatName: DEFAULT_RETRO_FORMAT.name,
    teamId,
  });
  await seedUser(t, "guest", "anonymous");
  await joinRoom(t, roomId, "guest");
  const retro = await retroRow(t, roomId);
  const byKind = (kind: string) => retro.stages.find((s) => s.kind === kind)!;
  const advance = (kind: string) => as(t, "admin").mutation(api.retro.advance, { roomId, toStageId: byKind(kind).id });
  const write = (who: string, clientId: string, promptIndex = 0) =>
    as(t, who).mutation(api.retro.createCard, {
      roomId,
      clientId,
      text: `Card ${clientId}`,
      promptId: retro.format.prompts[promptIndex].id,
      position: { x: 0, y: 0 },
    });
  const group = (clientIds: string[]) => as(t, "admin").mutation(api.retro.formCluster, { roomId, clientIds });
  const dot = (who: string, target: { kind: "card"; id: Id<"retroCards"> } | { kind: "cluster"; id: Id<"retroClusters"> }) =>
    as(t, who).mutation(api.retro.placeDot, { roomId, target });
  const action = (who: string, text: string, extra: Record<string, unknown> = {}) =>
    as(t, who).mutation(api.retro.createAction, { roomId, text, ...extra });
  return { roomId, retro, byKind, advance, write, group, dot, action };
}

const exportMd = (t: T, who: string, roomId: Id<"rooms">) => as(t, who).query(api.retro.exportMarkdown, { roomId });

describe("retro.exportMarkdown (spec §15.3)", () => {
  it("in collect, a non-author reads silhouettes as hidden cards and their own card in full; nothing else leaks", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const { roomId, write } = await seedRetro(t, teamId);
    await write("admin", "a1");
    await write("guest", "g1");

    const asGuest = await exportMd(t, "guest", roomId);
    expect(asGuest.filename).toBe("Sprint 42.md");
    expect(asGuest.content).toContain("# Sprint 42");
    expect(asGuest.content).toContain("Card g1");
    expect(asGuest.content).not.toContain("Card a1");
    expect(asGuest.content).toContain(`(${HIDDEN_CARD_LABEL.toLowerCase()})`);

    // A Team member who never attended reads it too (ADR-0009): every card a silhouette.
    const asMember = await exportMd(t, "member", roomId);
    expect(asMember.content).not.toContain("Card a1");
    expect(asMember.content).not.toContain("Card g1");
    // Two card lines, each a silhouette; a hidden lone card's topic title is one too.
    expect(asMember.content.match(/^- \(hidden card\)$/gm)).toHaveLength(2);
  });

  it("names the retro's facts, the team, the format, the stages walked, each topic with its cards under their prompts and its dot count, then the action items", async () => {
    const t = convexTest(schema, modules);
    const { teamId, adminId } = await seedTeam(t);
    const { roomId, write, group, dot, advance, action } = await seedRetro(t, teamId);
    const { cardId: a1 } = await write("admin", "a1", 0);
    await write("guest", "g1", 1);
    await write("guest", "g2", 1);
    const k = await group(["g1", "g2"]);
    await as(t, "admin").mutation(api.retro.renameCluster, { roomId, clusterId: k, name: "Flaky CI" });
    await advance("vote");
    await dot("admin", { kind: "cluster", id: k });
    await dot("guest", { kind: "cluster", id: k });
    await dot("guest", { kind: "card", id: a1 });
    await advance("discuss");
    const walk = (await retroRow(t, roomId)).walk!;
    await as(t, "admin").mutation(api.retro.markCovered, { roomId, topicId: walk.order[0].id, covered: true });
    await write("guest", "late", 0);
    await action("admin", "Fix the flaky test", { ownerId: adminId, dueAt: Date.UTC(2026, 8, 12) });
    const dropped = await action("guest", "Buy a bigger monitor");
    await as(t, "guest").mutation(api.retro.setActionStatus, { roomId, actionId: dropped, status: "dropped", note: "Not ours to fix" });
    await advance("close");

    const { content } = await exportMd(t, "admin", roomId);
    const [prompt0, prompt1] = DEFAULT_RETRO_FORMAT.prompts.map((p) => p.label);
    expect(content).toMatch(/^# Sprint 42\n/);
    expect(content).toContain("Team: Acme Squad");
    expect(content).toMatch(/Created: \d{4}-\d{2}-\d{2}/);
    expect(content).toContain(`Format: ${DEFAULT_RETRO_FORMAT.name}`);
    expect(content).toContain("Stages walked: Collect, Review, Group, Vote, Discuss, Close");

    // The walk: covered then not covered over the order, then the late topic outside it.
    const discussion = content.slice(content.indexOf("## Discussion"), content.indexOf("## Action items"));
    expect(discussion.indexOf("Flaky CI")).toBeLessThan(discussion.indexOf("Card a1"));
    expect(discussion).toContain("### Flaky CI · covered · 2 votes");
    expect(discussion).toContain("### Card a1 · not covered · 1 vote");
    expect(discussion).toContain(`**${prompt1}**\n\n- Card g1 — guest\n- Card g2 — guest`);
    expect(discussion).toContain(`**${prompt0}**\n\n- Card a1 — admin`);
    expect(discussion.indexOf("## Outside the discussion")).toBeGreaterThan(discussion.indexOf("### Card a1"));
    expect(discussion).toContain("### Card late · new");

    const actions = content.slice(content.indexOf("## Action items"));
    expect(actions).toContain("- [ ] Fix the flaky test — Owner: admin · Due 2026-09-12 · Open");
    expect(actions).toContain(`- [-] Buy a bigger monitor — ${UNOWNED_ACTION} · Dropped · Note: Not ours to fix`);
  });

  it("an anonymous retro exports no author anywhere, and no export names a voter", async () => {
    const t = convexTest(schema, modules);
    const { teamId, adminId } = await seedTeam(t);
    await as(t, "admin").mutation(api.teams.updateRetroDefaults, {
      teamId,
      retroDefaults: { attribution: "anonymous", joinPolicy: "anyone", permissions: (await t.run((ctx) => ctx.db.get(teamId)))!.retroDefaults.permissions },
    });
    const { roomId, write, dot, advance } = await seedRetro(t, teamId);
    const { cardId } = await write("admin", "a1");
    await write("guest", "g1");
    await advance("vote");
    await dot("admin", { kind: "card", id: cardId });
    await advance("close");

    const { content } = await exportMd(t, "member", roomId);
    expect(content).toContain("- Card a1\n");
    expect(content).toContain("- Card g1\n");
    expect(content).not.toMatch(/— (admin|guest|member)/);
    expect(content).toContain("· 1 vote");
    // Ids never appear: not a voter's, not an author's.
    expect(content).not.toContain(adminId);
    expect(content).not.toMatch(/[a-z0-9]{32}/);
  });

  it("without a walk, lists topics in creation order under Topics; a dangling author reads as a former member", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const { roomId, write, advance } = await seedRetro(t, teamId);
    await write("guest", "g1");
    await write("admin", "a1");
    await advance("group");
    await as(t, "guest").mutation(api.users.deleteUser, {});

    const { content } = await exportMd(t, "admin", roomId);
    expect(content).toContain("## Topics");
    expect(content).not.toContain("## Discussion");
    expect(content.indexOf("### Card g1")).toBeLessThan(content.indexOf("### Card a1"));
    expect(content).toContain(`- Card g1 — ${FORMER_MEMBER}`);
    expect(content).not.toContain("votes");
  });

  it("is refused to a non-reader and to an unauthenticated caller; a teamless retro names no team", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    const { roomId } = await seedRetro(t, teamId);
    await expect(exportMd(t, "stranger", roomId)).rejects.toThrow("You don't have access to this room");
    await expect(t.query(api.retro.exportMarkdown, { roomId })).rejects.toThrow("Not authenticated");

    const loose = await as(t, "admin").mutation(api.retro.create, { name: "Loose", formatName: DEFAULT_RETRO_FORMAT.name });
    const { content } = await exportMd(t, "admin", loose);
    expect(content).toContain("Not kept by a team");
    expect(content).not.toContain("Team: ");
  });
});

describe("teams.exportHistory (spec §15.4)", () => {
  it("returns one JSON file of every retro in creation order in the board's shape for that reader, plus the Team's action items", async () => {
    const t = convexTest(schema, modules);
    const { teamId, adminId } = await seedTeam(t);
    const first = await seedRetro(t, teamId, "First");
    const { cardId } = await first.write("admin", "f1");
    await first.write("guest", "f2");
    await first.advance("vote");
    await first.dot("admin", { kind: "card", id: cardId });
    await first.advance("discuss");
    await first.advance("close");
    await first.action("admin", "Ship it", { ownerId: adminId });
    const second = await seedRetro(t, teamId, "Second");
    await second.write("admin", "s1");
    const done = await second.action("guest", "Write it up");
    await as(t, "guest").mutation(api.retro.setActionStatus, { roomId: second.roomId, actionId: done, status: "done" });
    // A teamless retro and another Team's retro are not in this file.
    await as(t, "admin").mutation(api.retro.create, { name: "Loose", formatName: DEFAULT_RETRO_FORMAT.name });

    const file = await as(t, "member").action(api.teams.exportHistory, { teamId });
    expect(file.filename).toBe("Acme Squad.json");
    const json = JSON.parse(file.content);
    expect(json.team).toEqual({ name: "Acme Squad", exportedAt: expect.any(String) });
    expect(json.retros.map((r: { name: string }) => r.name)).toEqual(["First", "Second"]);

    // First is closed: every card in full, the vote as a count on the tally, the walk.
    const closed = json.retros[0];
    expect(closed.roomId).toBe(first.roomId);
    expect(closed.createdAt).toEqual(expect.any(Number));
    expect(closed.board.cards.map((c: { text?: string }) => c.text).sort()).toEqual(["Card f1", "Card f2"]);
    expect(closed.board.cards.every((c: { authorId?: string }) => c.authorId !== undefined)).toBe(true);
    expect(closed.board.walk).toBeDefined();
    expect(closed.tally.counts[cardId]).toBe(1);
    expect(JSON.stringify(closed)).not.toContain("voterId");
    expect(closed.people[adminId]).toBe("admin");

    // Second is collecting: silhouettes for the member, who wrote nothing.
    const collecting = json.retros[1];
    expect(collecting.board.cards).toHaveLength(1);
    expect(collecting.board.cards[0].text).toBeUndefined();
    expect(collecting.board.cards[0].authorId).toBeUndefined();

    // The Team's action items, every status, oldest first, names by reference.
    expect(json.actions.map((a: { text: string; status: string; roomName: string }) => [a.text, a.status, a.roomName])).toEqual([
      ["Ship it", "open", "First"],
      ["Write it up", "done", "Second"],
    ]);
    expect(json.actions[0].ownerName).toBe("admin");
    expect(json.actions[0].rights).toBeUndefined();
  });

  it("an anonymous retro's cards carry no authorId, and the file names no voter", async () => {
    const t = convexTest(schema, modules);
    const { teamId, adminId } = await seedTeam(t);
    await as(t, "admin").mutation(api.teams.updateRetroDefaults, {
      teamId,
      retroDefaults: { attribution: "anonymous", joinPolicy: "anyone", permissions: (await t.run((ctx) => ctx.db.get(teamId)))!.retroDefaults.permissions },
    });
    const { roomId, write, dot, advance } = await seedRetro(t, teamId);
    const { cardId } = await write("admin", "a1");
    await advance("vote");
    await dot("admin", { kind: "card", id: cardId });
    await advance("close");

    const file = await as(t, "admin").action(api.teams.exportHistory, { teamId });
    const json = JSON.parse(file.content);
    expect(json.retros[0].roomId).toBe(roomId);
    expect(json.retros[0].board.cards[0].text).toBe("Card a1");
    expect(json.retros[0].board.cards[0].authorId).toBeUndefined();
    expect(json.retros[0].tally.counts[cardId]).toBe(1);
    expect(file.content).not.toContain("voterId");
    expect(file.content).not.toContain(adminId);
  });

  it("is refused to anyone outside the Team and to an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await seedTeam(t);
    await seedRetro(t, teamId);
    await expect(as(t, "stranger").action(api.teams.exportHistory, { teamId })).rejects.toThrow(
      "You are not a member of this team"
    );
    await expect(t.action(api.teams.exportHistory, { teamId })).rejects.toThrow("Not authenticated");
  });
});
