import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { ceremonyOf, NOT_THIS_CEREMONY } from "../ceremony";
import type { RetroPermissions, RoomPermissions } from "../permissions";
import { requireCan } from "./auth";
import * as Ownership from "./ownership";
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
 * whichever the room's ceremony has. Owner only.
 */
export async function updatePermissions(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; permissions: RoomPermissions | RetroPermissions }
): Promise<void> {
  const { room } = await requireCan(ctx, args.roomId, { kind: "relationship", verb: "changePerms" });
  const shape = "stageFlow" in args.permissions ? "retro" : "poker";
  if (shape !== ceremonyOf(room)) throw new Error(NOT_THIS_CEREMONY);
  await ctx.db.patch("rooms", room._id, { permissions: args.permissions });
  await Rooms.updateRoomActivity(ctx, room);
}
