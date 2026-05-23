import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { COUNTDOWN_DURATION_MS } from "../constants";
import * as Votes from "./votes";

/**
 * Countdown — the auto-reveal countdown seam of the voting round.
 *
 * `arm` / `cancel` / `evaluate` are the only places the countdown's two room
 * fields (`autoRevealCountdownStartedAt`, `autoRevealScheduledId`) and its
 * scheduled reveal are written. They move as one unit, so a countdown is never
 * left half-torn-down (the early-reveal bug this module exists to prevent).
 *
 * The token stamped by `arm` (the `startedAt` timestamp) is carried into the
 * scheduled `autoReveal`; the reveal fires only while that token is still the
 * room's live countdown, so a stale job is inert even if a cancel is missed.
 */

export async function arm(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get(roomId);
  if (!room) throw new Error("Room not found");
  if (room.autoRevealCountdownStartedAt) return; // already counting down

  // The token is the startedAt timestamp; it is carried into the scheduled
  // reveal so a stale job (countdown since cleared/replaced) reveals nothing.
  const token = Date.now();
  const scheduledId = await ctx.scheduler.runAfter(
    COUNTDOWN_DURATION_MS,
    internal.votingRound.autoReveal,
    { roomId, token }
  );
  await ctx.db.patch(roomId, {
    autoRevealCountdownStartedAt: token,
    autoRevealScheduledId: scheduledId,
  });
}

export async function cancel(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get(roomId);
  if (!room) return;

  if (room.autoRevealScheduledId) {
    try {
      await ctx.scheduler.cancel(room.autoRevealScheduledId);
    } catch {
      // Job may have already executed or been cancelled — that's fine.
    }
  }

  if (room.autoRevealCountdownStartedAt || room.autoRevealScheduledId) {
    await ctx.db.patch(roomId, {
      autoRevealCountdownStartedAt: undefined,
      autoRevealScheduledId: undefined,
    });
  }
}

export async function evaluate(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get(roomId);
  if (!room) return;
  if (!room.autoCompleteVoting || room.isGameOver) return;

  const allIn = await Votes.areAllVotesIn(ctx, roomId);
  if (allIn && !room.autoRevealCountdownStartedAt) {
    await arm(ctx, roomId);
  } else if (!allIn && room.autoRevealCountdownStartedAt) {
    await cancel(ctx, roomId);
  }
}
