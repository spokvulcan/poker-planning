/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_RETRO_FORMAT } from "./model/retroFormats";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";
import { FORMER_MEMBER } from "./retroCopy";

// Account deletion (spec §15.2, ADR-0019): the user row goes and the
// content stays. `authorId`, `voterId`, `ownerId` and `createdBy` dangle
// and render "Former member"; a team retro whose owner deletes their
// account enters lockdown and is recovered by `claim`. The auth provider's
// record is not this module's to touch.

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

const joinRoom = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/**
 * A Team with two admins ("admin" and "leaver", so the leaver's deletion
 * is not refused by the last-admin rule) and a team retro the leaver owns,
 * with a card, a dot and an action item of theirs in it; the admin attends.
 */
async function seedLeaverRetro(t: T) {
  await seedUser(t, "admin", "permanent");
  const leaverId = await seedUser(t, "leaver", "permanent");
  const teamId = await as(t, "leaver").mutation(api.teams.create, { name: "Acme" });
  const team = (await t.run((ctx) => ctx.db.get(teamId)))!;
  await as(t, "admin").mutation(api.teams.joinByInvite, { inviteToken: team.inviteToken });
  await as(t, "leaver").mutation(api.teams.promote, { teamId, targetUserId: (await t.run((ctx) => ctx.db.query("users").withIndex("by_auth_user", (q) => q.eq("authUserId", "admin")).unique()))!._id });
  const roomId = await as(t, "leaver").mutation(api.retro.create, { name: "R", formatName: DEFAULT_RETRO_FORMAT.name, teamId });
  await joinRoom(t, roomId, "admin");
  const retro = await retroRow(t, roomId);
  const byKind = (kind: string) => retro.stages.find((s) => s.kind === kind)!;
  const { cardId } = await as(t, "leaver").mutation(api.retro.createCard, {
    roomId,
    clientId: "c1",
    text: "Mine",
    promptId: retro.format.prompts[0].id,
    position: { x: 0, y: 0 },
  });
  await as(t, "leaver").mutation(api.retro.advance, { roomId, toStageId: byKind("vote").id });
  await as(t, "leaver").mutation(api.retro.placeDot, { roomId, target: { kind: "card", id: cardId } });
  await as(t, "leaver").mutation(api.retro.advance, { roomId, toStageId: byKind("close").id });
  const actionId = await as(t, "leaver").mutation(api.retro.createAction, { roomId, text: "Do it", ownerId: leaverId });
  return { teamId, roomId, leaverId, cardId, actionId };
}

describe("deleting a permanent account (spec §15.2)", () => {
  it("removes the user row and their memberships, and leaves cards, dots and action items in place with dangling references", async () => {
    const t = convexTest(schema, modules);
    const { teamId, roomId, leaverId, cardId, actionId } = await seedLeaverRetro(t);

    await as(t, "leaver").mutation(api.users.deleteUser, {});

    expect(await t.run((ctx) => ctx.db.get(leaverId))).toBeNull();
    const card = (await t.run((ctx) => ctx.db.get(cardId)))!;
    expect(card.text).toBe("Mine");
    expect(card.authorId).toBe(leaverId);
    const dots = await t.run((ctx) => ctx.db.query("retroVotes").withIndex("by_voter", (q) => q.eq("voterId", leaverId)).collect());
    expect(dots).toHaveLength(1);
    const action = (await t.run((ctx) => ctx.db.get(actionId)))!;
    expect(action.ownerId).toBe(leaverId);
    expect(action.createdBy).toBe(leaverId);
    const room = (await t.run((ctx) => ctx.db.get(roomId)))!;
    expect(room.ownerId).toBe(leaverId);
    expect(room.teamId).toBe(teamId);
    expect(
      await t.run((ctx) => ctx.db.query("roomMemberships").withIndex("by_user", (q) => q.eq("userId", leaverId)).collect())
    ).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("teamMemberships").withIndex("by_user", (q) => q.eq("userId", leaverId)).collect())
    ).toEqual([]);
  });

  it("the reads render the dangling references as Former member: the action's owner and creator, the export's author", async () => {
    const t = convexTest(schema, modules);
    const { roomId, leaverId } = await seedLeaverRetro(t);
    await as(t, "leaver").mutation(api.users.deleteUser, {});

    const actions = await as(t, "admin").query(api.retro.actions, { roomId });
    expect(actions.items[0]).toMatchObject({ ownerId: leaverId, ownerName: FORMER_MEMBER, creatorName: FORMER_MEMBER });
    const board = await as(t, "admin").query(api.retro.board, { roomId });
    expect(board.cards[0]).toMatchObject({ text: "Mine", authorId: leaverId });
    const exported = await as(t, "admin").query(api.retro.exportMarkdown, { roomId });
    expect(exported.content).toContain(`- Mine — ${FORMER_MEMBER}`);
    expect(exported.content).toContain(`Owner: ${FORMER_MEMBER}`);
  });

  it("a team retro whose owner deleted their account is in lockdown and a team admin recovers it by claim", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedLeaverRetro(t);
    await as(t, "leaver").mutation(api.users.deleteUser, {});

    const shell = await t.query(api.rooms.get, { roomId });
    expect(shell?.isOwnerAbsent).toBe(true);

    await as(t, "admin").mutation(api.retro.claim, { roomId });
    const adminId = (await t.run((ctx) => ctx.db.query("users").withIndex("by_auth_user", (q) => q.eq("authUserId", "admin")).unique()))!._id;
    expect((await t.run((ctx) => ctx.db.get(roomId)))!.ownerId).toBe(adminId);
    expect((await t.query(api.rooms.get, { roomId }))?.isOwnerAbsent).toBe(false);
  });
});
