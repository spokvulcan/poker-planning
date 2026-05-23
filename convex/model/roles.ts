import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { RoomPermissions } from "../permissions";
import { requireCan } from "./auth";

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

  await ctx.db.patch(target!._id, { role: "facilitator" });
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

  await ctx.db.patch(target!._id, { role: "participant" });
}

/**
 * Transfers ownership from the current owner to another member.
 * The old owner becomes a participant; the new owner gets the "owner" role.
 */
export async function transferOwnership(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; targetUserId: Id<"users"> }
): Promise<void> {
  const { user, membership: actorMembership, room, target } = await requireCan(
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

  // Swap roles: old owner → participant, new owner → owner
  await ctx.db.patch(actorMembership._id, { role: "participant" });
  await ctx.db.patch(target!._id, { role: "owner" });

  // Update room's ownerId
  await ctx.db.patch(args.roomId, { ownerId: args.targetUserId });
}

/**
 * Updates room permission settings.
 * Caller must be owner.
 */
export async function updatePermissions(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; permissions: RoomPermissions }
): Promise<void> {
  await requireCan(ctx, args.roomId, {
    kind: "relationship",
    verb: "changePerms",
  });

  await ctx.db.patch(args.roomId, { permissions: args.permissions });
}
