import { mutation } from "./_generated/server";
import { v } from "convex/values";
import * as VotingRound from "./model/votingRound";
import { requireRoomMember } from "./model/auth";

export const pickCard = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
    cardLabel: v.string(),
    cardValue: v.number(),
    cardIcon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRoomMember(ctx, args.roomId);
    if (user._id !== args.userId) {
      throw new Error("Cannot vote as another user");
    }
    await VotingRound.castVote(ctx, args);
  },
});

export const removeCard = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRoomMember(ctx, args.roomId);
    if (user._id !== args.userId) {
      throw new Error("Cannot remove another user's vote");
    }
    await VotingRound.retractVote(ctx, args);
  },
});
