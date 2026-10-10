import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { ceremonyOf, NOT_THIS_CEREMONY } from "../ceremony";
import { isRetroPermissions, type RetroPermissions, type RoomPermissions } from "../permissions";
import { requireCan } from "./auth";
import * as Ownership from "./ownership";
import { refusal } from "./refusal";
import * as Rooms from "./rooms";

/**
 * Promotes a participant to facilitator.
 * Caller must be owner or facilitator; target must be a participant.
 */
export async function promoteFacilitator(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; targetUserId: Id<"users"> }
): Promise<void> {
  const { target } = await requireCan(
    ctx,
    args.roomId,
    { kind: "relationship", verb: "promote" },
    args.targetUserId
  );

  await ctx.db.patch("roomMemberships", target!._id, { role: "facilitator" });
  await Rooms.updateRoomActivity(ctx, args.roomId);
}

/**
 * Demotes a facilitator to participant.
 * Caller must be owner; target must be a facilitator.
 */
export async function demoteFacilitator(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; targetUserId: Id<"users"> }
): Promise<void> {
  const { target } = await requireCan(
    ctx,
    args.roomId,
    { kind: "relationship", verb: "demote" },
    args.targetUserId
  );

  await ctx.db.patch("roomMemberships", target!._id, { role: "participant" });
  await Rooms.updateRoomActivity(ctx, args.roomId);
}

/**
 * Transfers ownership from the current owner to another member.
 * The old owner becomes a participant; the new owner gets the "owner" role.
 */
export async function transferOwnership(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; targetUserId: Id<"users"> }
): Promise<void> {
  const { user, room } = await requireCan(
    ctx,
    args.roomId,
    { kind: "relationship", verb: "transfer" },
    args.targetUserId
  );

  // Identity rules stay in the handler, after the guard — these are identity,
  // not role, so they do not belong in the pure decision.
  if (room.ownerId !== user._id) {
    throw new Error("Only the room owner can transfer ownership");
  }
  if (args.targetUserId === user._id) {
    throw new Error("Cannot transfer ownership to yourself");
  }

  await Ownership.transferOwnership(ctx, room, args.targetUserId);
  await Rooms.updateRoomActivity(ctx, args.roomId);
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
