/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type T, seedUser as seedNamedUser } from "./analytics.seeds";

// Account deletion: the user row and their memberships go; what they wrote
// stays. A sticky's `authorId`, a vote's `voterId` and an action item's
// `ownerId` dangle, and the reads render them as "Former member". A retro the account owned goes to whoever joined it first, or,
// with nobody else in it, is deleted with the account. The auth provider's
// record is not this module's to touch.

const modules = import.meta.glob("./**/*.*s");

const FORMER_MEMBER = "Former member";

const seedUser = (t: T, authUserId: string, accountType?: "anonymous" | "permanent") =>
  seedNamedUser(t, authUserId, authUserId, accountType);
const as = (t: T, subject: string) => t.withIdentity({ subject });

const joinRoom = (t: T, roomId: Id<"rooms">, subject: string) =>
  as(t, subject).mutation(api.users.join, { roomId, name: subject, authUserId: subject });

/**
 * A retro the leaver owns, showing authors, with a sticky, a vote and an
 * action item of theirs in it. The stayer attends as a facilitator.
 */
async function seedLeaverRetro(t: T) {
  const leaverId = await seedUser(t, "leaver", "permanent");
  const leaver = as(t, "leaver");
  const roomId = await leaver.mutation(api.retro.create, { name: "R" });
  await joinRoom(t, roomId, "leaver");
  const stayerId = await joinRoom(t, roomId, "stayer");
  await leaver.mutation(api.roles.promoteFacilitator, { roomId, targetUserId: stayerId });
  await leaver.mutation(api.retro.updateSettings, { roomId, showAuthors: true });
  const stickyId = await leaver.mutation(api.retro.addSticky, {
    roomId,
    clientId: "s1",
    columnId: "c1",
    text: "Mine",
    position: { x: 0, y: 0 },
  });
  await leaver.mutation(api.retro.setStep, { roomId, step: "vote" });
  await leaver.mutation(api.retro.toggleVote, { stickyId });
  const itemId = await leaver.mutation(api.retro.addActionItem, { roomId, text: "Do it", ownerId: leaverId });
  return { roomId, leaverId, stickyId, itemId };
}

describe("deleting an account", () => {
  it("removes the user row and their memberships, and leaves stickies, votes and action items in place with dangling references", async () => {
    const t = convexTest(schema, modules);
    const { roomId, leaverId, stickyId, itemId } = await seedLeaverRetro(t);

    await as(t, "leaver").mutation(api.users.deleteUser, {});

    expect(await t.run((ctx) => ctx.db.get(leaverId))).toBeNull();
    expect(
      await t.run((ctx) =>
        ctx.db.query("roomMemberships").withIndex("by_user", (q) => q.eq("userId", leaverId)).collect()
      )
    ).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(stickyId))).toMatchObject({ text: "Mine", authorId: leaverId });
    const votes = await t.run((ctx) =>
      ctx.db.query("retroStickyVotes").withIndex("by_voter", (q) => q.eq("voterId", leaverId)).collect()
    );
    expect(votes).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(itemId))).toMatchObject({ ownerId: leaverId });
    expect(await t.run((ctx) => ctx.db.get(roomId))).not.toBeNull();
  });

  it("the reads render the dangling references as Former member, and the vote still counts", async () => {
    const t = convexTest(schema, modules);
    const { roomId, leaverId, stickyId } = await seedLeaverRetro(t);
    await as(t, "leaver").mutation(api.users.deleteUser, {});

    const board = await as(t, "stayer").query(api.retro.board, { roomId });
    expect(board.stickies.find((s) => s._id === stickyId)).toMatchObject({
      text: "Mine",
      authorName: FORMER_MEMBER,
    });
    expect(await as(t, "stayer").query(api.retro.votesCast, { roomId })).toBe(1);
    const items = await as(t, "stayer").query(api.retro.actionItems, { roomId });
    expect(items).toEqual([expect.objectContaining({ text: "Do it", ownerId: leaverId, ownerName: FORMER_MEMBER })]);
  });

  it("hands a retro the account owned to whoever joined it first, who can then run and delete it", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedLeaverRetro(t);
    const stayerId = await t.run(async (ctx) =>
      (await ctx.db.query("users").withIndex("by_auth_user", (q) => q.eq("authUserId", "stayer")).first())!._id
    );
    await as(t, "leaver").mutation(api.users.deleteUser, {});

    const room = await t.query(api.rooms.get, { roomId });
    expect(room?.room.ownerId).toBe(stayerId);
    expect(room?.isOwnerAbsent).toBe(false);
    expect(room?.users.find((u) => u._id === stayerId)?.role).toBe("owner");
    await as(t, "stayer").mutation(api.retro.setStep, { roomId, step: "discuss" });
    await as(t, "stayer").mutation(api.retro.remove, { roomId });
  });

  it("keeps a guest's retro once it passes to a permanent account", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "guest", "anonymous");
    const roomId = await as(t, "guest").mutation(api.retro.create, { name: "Guest retro" });
    await joinRoom(t, roomId, "guest");
    await seedUser(t, "keeper", "permanent");
    await joinRoom(t, roomId, "keeper");
    expect((await t.run((ctx) => ctx.db.get(roomId)))!.retained).toBe(false);

    await as(t, "guest").mutation(api.users.deleteUser, {});

    expect((await t.run((ctx) => ctx.db.get(roomId)))!.retained).toBe(true);
  });

  it("deletes a retro nobody else joined along with the account", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "solo", "permanent");
    const roomId = await as(t, "solo").mutation(api.retro.create, { name: "Alone" });
    await joinRoom(t, roomId, "solo");

    await as(t, "solo").mutation(api.users.deleteUser, {});
    // The room cascade runs on real timers and reschedules itself until done.
    for (let i = 0; i < 50 && (await t.run((ctx) => ctx.db.get(roomId))); i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await t.finishInProgressScheduledFunctions();
    }

    expect(await t.run((ctx) => ctx.db.get(roomId))).toBeNull();
  });
});

