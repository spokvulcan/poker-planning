import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { rulesOf } from "../ceremony";
import { getEffectiveRole, type MemberRole } from "../permissions";
import * as Canvas from "./canvas";
import * as Ownership from "./ownership";
import { refusal } from "./refusal";
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

/** Every room a person is in, as their memberships. */
export async function membershipsOf(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"roomMemberships">[]> {
  return await ctx.db
    .query("roomMemberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
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
): Promise<void> {
  await Rooms.updateRoomActivity(ctx, room);
  const existing = await getMembership(ctx, room._id, user._id);
  if (!existing) {
    await ctx.db.insert("roomMemberships", {
      roomId: room._id,
      userId: user._id,
      // The bit stays on the row where a ceremony has no spectators, always false.
      isSpectator: rulesOf(room).spectators ? (options.isSpectator ?? false) : false,
      joinedAt: Date.now(),
    });
  }
  await Ownership.memberJoined(ctx, room, user._id);
  if (!existing) await Canvas.memberJoined(ctx, room, user._id);
}

/**
 * Sits a member out as a spectator, or back in. A spectator is voteless, so
 * sitting out drops their vote and the round re-checks whether everyone has
 * voted (ADR-0004); coming back in needs nothing from the round. Takes the
 * member's membership as the room-scoped step loaded it.
 */
export async function setSpectator(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  membership: Doc<"roomMemberships">,
  isSpectator: boolean
): Promise<void> {
  if (isSpectator && !rulesOf(room).spectators) throw refusal("missing", "Everyone takes part here: there are no spectators.");
  await Rooms.updateRoomActivity(ctx, room);
  if (membership.isSpectator === isSpectator) return;
  // The roster bit first, so the round re-checks against the new roster.
  await ctx.db.patch("roomMemberships", membership._id, { isSpectator });
  if (isSpectator) await VotingRound.dropVoter(ctx, room._id, membership.userId);
}

/**
 * Takes a member out of a room: leaving, or being removed. The membership
 * goes first, so the round re-checks completion against the smaller roster
 * when it drops their vote.
 */
export async function leave(ctx: MutationCtx, room: Doc<"rooms">, userId: Id<"users">): Promise<void> {
  const membership = await getMembership(ctx, room._id, userId);
  if (!membership) return;
  await takeOut(ctx, room, membership);
  await Rooms.updateRoomActivity(ctx, room);
}

/** Leaving, the room's clock aside: the canvas and the round let the member go. */
async function takeOut(ctx: MutationCtx, room: Doc<"rooms">, membership: Doc<"roomMemberships">): Promise<void> {
  await ctx.db.delete("roomMemberships", membership._id);
  await Canvas.memberLeft(ctx, room, membership.userId);
  await VotingRound.dropVoter(ctx, room._id, membership.userId);
}

/** Who is in which room. An account going is not room activity, so no clock moves. */
export const membershipUserRows: UserRows = {
  fields: ["roomMemberships.userId"],

  // The account leaves each room as a person does, so a round it was the last
  // one yet to vote in finishes without it (ADR-0004).
  async forget(ctx, userId) {
    await Promise.all(
      (await membershipsOf(ctx, userId)).map(async (membership) => {
        const room = await ctx.db.get("rooms", membership.roomId);
        if (room) await takeOut(ctx, room, membership);
        else await ctx.db.delete("roomMemberships", membership._id);
      })
    );
  },

  // In a room both were in, the account keeps its seat, and a guest's facilitator
  // role with it. The owner role is ownership's to seat: in the rooms the guest
  // owned (ownershipUserRows.fold), and where the guest's seat brings the
  // account back into a room it owns (Ownership.memberJoined). The guest's
  // player node is the canvas's to hand over (Canvas.seatFolded).
  async fold(ctx, from, into) {
    for (const guest of await membershipsOf(ctx, from)) {
      const account = await getMembership(ctx, guest.roomId, into);
      if (account) {
        if (getEffectiveRole(guest) === "facilitator" && getEffectiveRole(account) === "participant") {
          await ctx.db.patch("roomMemberships", account._id, { role: "facilitator" });
        }
        await ctx.db.delete("roomMemberships", guest._id);
      } else {
        await ctx.db.patch("roomMemberships", guest._id, { userId: into });
        const room = await ctx.db.get("rooms", guest.roomId);
        if (room) await Ownership.memberJoined(ctx, room, into);
      }
      await Canvas.seatFolded(ctx, guest.roomId, from, into);
    }
  },
};
