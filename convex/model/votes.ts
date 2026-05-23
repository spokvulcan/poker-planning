import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Votes — accessors over the `votes` table. Vote writes (cast / retract) and
 * the reveal-time per-voter snapshot are owned by the voting-round module
 * (`votingRound.ts`); this module only reads.
 */

/** Gets all votes for a room. */
export async function getRoomVotes(ctx: MutationCtx, roomId: Id<"rooms">) {
  return await ctx.db
    .query("votes")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
}

/** Checks whether every non-spectator member of the room has voted. */
export async function areAllVotesIn(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<boolean> {
  const [memberships, votes] = await Promise.all([
    ctx.db
      .query("roomMemberships")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
    getRoomVotes(ctx, roomId),
  ]);

  const nonSpectatorMembers = memberships.filter((m) => !m.isSpectator);
  const votedUserIds = new Set(votes.map((vote) => vote.userId));

  // `[].every()` is vacuously true — a room with no non-spectator members is
  // not "all in" (nobody can vote), so require at least one real voter.
  return (
    nonSpectatorMembers.length > 0 &&
    nonSpectatorMembers.every((m) => votedUserIds.has(m.userId))
  );
}
