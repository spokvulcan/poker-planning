import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { rulesOf } from "../ceremony";
import { scheduleRoomDeletion } from "./roomAggregate";
import type { UserRows } from "./userRows";

/**
 * Room ownership (CONTEXT.md: Role, Lockdown, Retained, Hand-off): the one
 * writer of who owns a room. Three stored facts must agree: `rooms.ownerId`,
 * the owner role on that person's membership, and `rooms.retained`. The
 * permission decision reads the role and lockdown reads the membership
 * (ADR-0001), so every path that changes who owns a room comes through here:
 * creation, transfer, a returning owner, the hand-off when an owner's account
 * is deleted, and a guest signing in (ADR-0029). Promoting and demoting
 * facilitators never touches the owner role, so it stays with roles.ts.
 */

/** Whether a room is kept past the inactivity sweep with `owner` owning it. A kept room stays kept. */
export function isRetainedUnder(
  room: Pick<Doc<"rooms">, "roomType" | "retained">,
  owner: Pick<Doc<"users">, "accountType"> | null
): boolean {
  return room.retained || (rulesOf(room).retainedByPermanentOwner && owner?.accountType === "permanent");
}

/** The ownership a new room is created with. Its owner is seated when they join it. */
export function initialOwnership(
  room: Pick<Doc<"rooms">, "roomType">,
  owner: Doc<"users">
): { ownerId: Id<"users">; retained: boolean } {
  return { ownerId: owner._id, retained: isRetainedUnder({ ...room, retained: false }, owner) };
}

async function membershipOf(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">
): Promise<Doc<"roomMemberships"> | null> {
  return await ctx.db
    .query("roomMemberships")
    .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
    .first();
}

/**
 * The role a person joins a room with: owner for the room's owner, nothing
 * stored (a participant) for everyone else.
 */
export function roleOnJoin(room: Pick<Doc<"rooms">, "ownerId">, userId: Id<"users">): "owner" | undefined {
  return room.ownerId === userId ? "owner" : undefined;
}

/** Gives the owner role back to a room's owner when their membership lacks it (a returning owner). */
export async function seatOwner(ctx: MutationCtx, room: Doc<"rooms">): Promise<void> {
  if (!room.ownerId) return;
  const membership = await membershipOf(ctx, room._id, room.ownerId);
  if (membership && membership.role !== "owner") {
    await ctx.db.patch("roomMemberships", membership._id, { role: "owner" });
  }
}

/**
 * Hands a room to another member: they become its owner and take the owner
 * role, the previous owner (if still in the room) becomes a participant, and
 * the room is kept when its new owner keeps rooms of its kind.
 */
export async function transferOwnership(ctx: MutationCtx, room: Doc<"rooms">, ownerId: Id<"users">): Promise<void> {
  const previous = room.ownerId;
  await setOwnerOf(ctx, room, ownerId);
  if (previous && previous !== ownerId) {
    const leaving = await membershipOf(ctx, room._id, previous);
    if (leaving?.role === "owner") await ctx.db.patch("roomMemberships", leaving._id, { role: "participant" });
  }
}

/** `ownerId` and retention for a new owner, and the owner role on their membership when they have one. */
async function setOwnerOf(ctx: MutationCtx, room: Doc<"rooms">, ownerId: Id<"users">): Promise<void> {
  const owner = await ctx.db.get("users", ownerId);
  await ctx.db.patch("rooms", room._id, { ownerId, retained: isRetainedUnder(room, owner) });
  const membership = await membershipOf(ctx, room._id, ownerId);
  if (membership && membership.role !== "owner") {
    await ctx.db.patch("roomMemberships", membership._id, { role: "owner" });
  }
}

/** The rooms a person owns. */
async function ownedRooms(ctx: QueryCtx, ownerId: Id<"users">): Promise<Doc<"rooms">[]> {
  return await ctx.db
    .query("rooms")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
}

/**
 * An account turned permanent: the rooms it owns are kept from now on
 * wherever a permanent owner keeps them (a retro).
 */
export async function ownerTurnedPermanent(ctx: MutationCtx, ownerId: Id<"users">): Promise<void> {
  const owner = await ctx.db.get("users", ownerId);
  await Promise.all(
    (await ownedRooms(ctx, ownerId))
      .filter((room) => !room.retained && isRetainedUnder(room, owner))
      .map((room) => ctx.db.patch("rooms", room._id, { retained: true }))
  );
}

/**
 * The hand-off: when an owner's account is deleted, each room they own goes
 * to the member who joined it first, or, with nobody else in it, is deleted.
 * The same for both ceremonies, so no room is left with an owner who can
 * never come back.
 */
async function handOff(ctx: MutationCtx, room: Doc<"rooms">, leavingOwnerId: Id<"users">): Promise<void> {
  const members = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  const heir = members
    .filter((m) => m.userId !== leavingOwnerId)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (heir) {
    await transferOwnership(ctx, room, heir.userId);
  } else {
    await scheduleRoomDeletion(ctx, room._id);
  }
}

/** Who owns which room: handed off when an account goes, carried over when a guest signs in. */
export const ownershipUserRows: UserRows = {
  fields: ["rooms.ownerId"],

  async forget(ctx, userId) {
    for (const room of await ownedRooms(ctx, userId)) await handOff(ctx, room, userId);
  },

  // The same person under a new account: the guest's membership keeps its
  // owner role until memberships fold it in, so nothing is demoted here.
  async fold(ctx, from, into) {
    for (const room of await ownedRooms(ctx, from)) await setOwnerOf(ctx, room, into);
  },
};
