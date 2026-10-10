import { MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { ceremonyOf, NOT_THIS_CEREMONY } from "../ceremony";
import { isRetroPermissions, type RetroPermissions, type RoomPermissions } from "../permissions";
import * as Ownership from "./ownership";
import { refusal } from "./refusal";
import * as Rooms from "./rooms";

/**
 * Promotes a participant to facilitator. The handler's room-scoped step runs
 * the `promote` guard (the caller an owner or a facilitator, the target a
 * participant) and hands over the room and the target's membership.
 */
export async function promoteFacilitator(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  target: Doc<"roomMemberships">
): Promise<void> {
  await ctx.db.patch("roomMemberships", target._id, { role: "facilitator" });
  await Rooms.updateRoomActivity(ctx, room);
}

/**
 * Demotes a facilitator to participant. The handler's room-scoped step runs
 * the `demote` guard (the caller the owner, the target a facilitator) and
 * hands over the room and the target's membership.
 */
export async function demoteFacilitator(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  target: Doc<"roomMemberships">
): Promise<void> {
  await ctx.db.patch("roomMemberships", target._id, { role: "participant" });
  await Rooms.updateRoomActivity(ctx, room);
}

/**
 * Transfers ownership from the current owner to another member.
 * The old owner becomes a participant; the new owner gets the "owner" role.
 * The handler's room-scoped step runs the `transfer` guard and hands over the
 * room, the caller and the target's membership.
 */
export async function transferOwnership(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  caller: Doc<"users">,
  target: Doc<"roomMemberships">
): Promise<void> {
  // Identity rules stay here, after the guard — these are identity, not
  // role, so they do not belong in the pure decision.
  if (room.ownerId !== caller._id) {
    throw new Error("Only the room owner can transfer ownership");
  }
  if (target.userId === caller._id) {
    throw new Error("Cannot transfer ownership to yourself");
  }

  await Ownership.transferOwnership(ctx, room, target.userId);
  await Rooms.updateRoomActivity(ctx, room);
}

/**
 * Sets who may do what in a room: the poker room's categories or the retro's,
 * whichever the room's ceremony has. Owner only: the handler's room-scoped
 * step runs the `changePerms` guard and hands over the room.
 */
export async function updatePermissions(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  permissions: RoomPermissions | RetroPermissions
): Promise<void> {
  if (isRetroPermissions(permissions) !== (ceremonyOf(room) === "retro")) throw refusal("missing", NOT_THIS_CEREMONY);
  await ctx.db.patch("rooms", room._id, { permissions });
  await Rooms.updateRoomActivity(ctx, room);
}
