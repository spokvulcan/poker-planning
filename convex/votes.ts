import { mutation } from "./_generated/server";
import { v } from "convex/values";
import * as VotingRound from "./model/votingRound";
import { requireRoomWrite } from "./model/auth";

export const pickCard = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.optional(v.id("users")), // Ignored: the caller's own id, which old browsers still send
    cardLabel: v.string(),
    // Ignored: castVote reads the card's value from the room's deck. Optional,
    // and kept only because old browsers still send it.
    cardValue: v.optional(v.number()),
    cardIcon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { room, membership } = await requireRoomWrite(ctx, args.roomId);
    await VotingRound.castVote(ctx, { room, voter: membership, cardLabel: args.cardLabel, cardIcon: args.cardIcon });
  },
});

export const removeCard = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.optional(v.id("users")), // Ignored: the caller's own id, which old browsers still send
  },
  handler: async (ctx, args) => {
    const { room, user } = await requireRoomWrite(ctx, args.roomId);
    await VotingRound.retractVote(ctx, { room, userId: user._id });
  },
});
