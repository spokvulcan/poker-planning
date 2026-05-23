import { QueryCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

/**
 * Checks if the room owner has left (no active membership) — the lockdown
 * condition. Only an explicit leave removes membership; a network disconnect
 * does NOT trigger this. Returns false for legacy rooms without an owner.
 *
 * The role × level × target rule itself lives in the pure permission decision
 * (`evaluate` in convex/permissions.ts); this is just the IO that feeds it
 * the `ownerAbsent` input.
 */
export async function isRoomOwnerAbsent(
  ctx: QueryCtx,
  room: Doc<"rooms">
): Promise<boolean> {
  if (!room.ownerId) return false; // Legacy room, no owner set

  const ownerMembership = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room_user", (q) =>
      q.eq("roomId", room._id).eq("userId", room.ownerId!)
    )
    .first();

  return !ownerMembership;
}
