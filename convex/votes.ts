import { mutation } from "./_generated/server";
import { v } from "convex/values";
import * as VotingRound from "./model/votingRound";
import { requireActingUser } from "./model/auth";

export const pickCard = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
    cardLabel: v.string(),
    // Accepted but ignored: the numeric value is re-derived server-side from
    // cardLabel in castVote. Kept in the API for client compatibility.
    cardValue: v.number(),
    cardIcon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireActingUser(ctx, args.roomId, args.userId, "Cannot vote as another user");
    await VotingRound.castVote(ctx, args);
  },
});

export const removeCard = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireActingUser(ctx, args.roomId, args.userId, "Cannot remove another user's vote");
    await VotingRound.retractVote(ctx, args);
  },
});
