import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import * as VotingRound from "./model/votingRound";

/**
 * Scheduled by the Countdown seam. Carries the countdown `token` so a stale job
 * (its countdown since cleared or replaced) reveals nothing.
 */
export const autoReveal = internalMutation({
  args: { roomId: v.id("rooms"), token: v.number() },
  handler: async (ctx, args) => {
    await VotingRound.autoReveal(ctx, args);
  },
});
