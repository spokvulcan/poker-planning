import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { rulesOf } from "../ceremony";
import { getEffectiveRole, type MemberRole } from "../permissions";
import * as Canvas from "./canvas";
import * as Ownership from "./ownership";
import * as Rooms from "./rooms";
import * as VotingRound from "./votingRound";
import type { UserRows } from "./userRows";

/**
 * Room attendance (CONTEXT.md: Room attendance): who is in which room, and
 * as what. The one writer of `roomMemberships` rows: joining, sitting out as
 * a spectator, leaving, and folding a guest's memberships into their account.
 * The owner role is ownership's to give (model/ownership.ts); what a member
 * joining or leaving does to the canvas and the voting round, those modules
 * decide (memberJoined/memberLeft, dropVoter).
 */

/** A member as the roster shows them: the person and their membership in one. */
export interface RoomUserData {
  _id: Id<"users">;
  name: string;
  avatarUrl?: string;
  isSpectator: boolean;
  isBot?: boolean;
  role: MemberRole;
  joinedAt: number;
  membershipId: Id<"roomMemberships">;
}

/** A person's membership in a room, if they are in it. */
export async function getMembership(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">
): Promise<Doc<"roomMemberships"> | null> {
  return await ctx.db
    .query("roomMemberships")
    .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
    .first();
}

/** Everyone in a room, as the roster shows them. */
export async function getRoomUsers(ctx: QueryCtx, roomId: Id<"rooms">): Promise<RoomUserData[]> {
  const memberships = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  const users = await Promise.all(memberships.map((m) => ctx.db.get("users", m.userId)));
  return memberships.map((membership, index) => {
    const user = users[index];
    if (!user) throw new Error("User not found for membership");
    return {
      _id: user._id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isSpectator: membership.isSpectator,
      role: getEffectiveRole(membership),
      joinedAt: membership.joinedAt,
      membershipId: membership._id,
    };
  });
}

/**
 * Seats a person in a room, as a participant who sits out as a spectator only
 * where the ceremony has spectators; ownership decides who is seated as the
 * owner (Ownership.memberJoined). Joining again changes nothing else.
 */
export async function join(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  user: Doc<"users">,
  options: { isSpectator?: boolean } = {}
): Promise<Doc<"roomMemberships">> {
  await Rooms.updateRoomActivity(ctx, room);
  const existing = await getMembership(ctx, room._id, user._id);
  const membershipId =
    existing?._id ??
    (await ctx.db.insert("roomMemberships", {
      roomId: room._id,
      userId: user._id,
      // The bit stays on the row where a ceremony has no spectators, always false.
      isSpectator: rulesOf(room).spectators ? (options.isSpectator ?? false) : false,
      joinedAt: Date.now(),
    }));
  await Ownership.memberJoined(ctx, room, user._id);
  if (!existing) await Canvas.memberJoined(ctx, room, user._id);
  return (await ctx.db.get("roomMemberships", membershipId))!;
}

/**
 * Sits a member out as a spectator, or back in. A spectator is voteless, so
 * sitting out drops their vote and the round re-checks whether everyone has
 * voted (ADR-0004); coming back in needs nothing from the round.
 */
export async function setSpectator(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  userId: Id<"users">,
  isSpectator: boolean
): Promise<void> {
  const membership = await getMembership(ctx, room._id, userId);
  if (!membership) throw new Error("User not in room");
  if (isSpectator && !rulesOf(room).spectators) throw new Error("Everyone takes part here: there are no spectators.");
  await Rooms.updateRoomActivity(ctx, room);
  if (membership.isSpectator === isSpectator) return;
  // The roster bit first, so the round re-checks against the new roster.
  await ctx.db.patch("roomMemberships", membership._id, { isSpectator });
  if (isSpectator) await VotingRound.dropVoter(ctx, room._id, userId);
}

/**
 * Takes a member out of a room: leaving, or being removed. The membership
 * goes first, so the round re-checks completion against the smaller roster
 * when it drops their vote.
 */
export async function leave(ctx: MutationCtx, room: Doc<"rooms">, userId: Id<"users">): Promise<void> {
  const membership = await getMembership(ctx, room._id, userId);
  if (!membership) return;
  await ctx.db.delete("roomMemberships", membership._id);
  await Canvas.memberLeft(ctx, room, userId);
  await VotingRound.dropVoter(ctx, room._id, userId);
  await Rooms.updateRoomActivity(ctx, room);
}

/** Who is in which room. An account going is not room activity, so no clock moves. */
export const membershipUserRows: UserRows = {
  fields: ["roomMemberships.userId"],

  // Their votes are the round's to drop, once the memberships are gone (votingRoundUserRows).
  async forget(ctx, userId) {
    const memberships = await ctx.db
      .query("roomMemberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const membership of memberships) {
      await ctx.db.delete("roomMemberships", membership._id);
      const room = await ctx.db.get("rooms", membership.roomId);
      if (room) await Canvas.memberLeft(ctx, room, userId);
    }
  },

  // In a room both were in, the account keeps its seat, and a guest's facilitator
  // role with it. An owner role is ownership's to seat (ownershipUserRows.fold).
  async fold(ctx, from, into) {
    const memberships = await ctx.db
      .query("roomMemberships")
      .withIndex("by_user", (q) => q.eq("userId", from))
      .collect();
    for (const guest of memberships) {
      const account = await getMembership(ctx, guest.roomId, into);
      if (!account) {
        await ctx.db.patch("roomMemberships", guest._id, { userId: into });
        continue;
      }
      if (getEffectiveRole(guest) === "facilitator" && getEffectiveRole(account) === "participant") {
        await ctx.db.patch("roomMemberships", account._id, { role: "facilitator" });
      }
      await ctx.db.delete("roomMemberships", guest._id);
    }
  },
};
