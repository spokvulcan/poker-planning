import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import * as Rooms from "./model/rooms";
import * as Users from "./model/users";
import * as VotingRound from "./model/votingRound";
import { requireRoomWrite } from "./model/auth";
import { getCaller } from "./model/caller";

// Create a new room
export const create = mutation({
  args: {
    name: v.string(),
    roomType: v.optional(v.literal("canvas")), // Optional, defaults to canvas
    autoCompleteVoting: v.optional(v.boolean()),
    votingScale: v.optional(
      v.object({
        type: v.union(
          v.literal("fibonacci"),
          v.literal("standard"),
          v.literal("tshirt"),
          v.literal("custom")
        ),
        cards: v.optional(v.array(v.string())), // Required only for custom type
      })
    ),
  },
  handler: async (ctx, args) => {
    const owner = await Users.findOrMakeUser(ctx);
    return await Rooms.createRoom(ctx, { ...args, owner });
  },
});

// Get room with all related data
export const get = query({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    // Derive currentUserId from server-side auth context (not client-supplied)
    // to prevent vote privacy bypass
    const caller = await getCaller(ctx);
    return await Rooms.getRoomWithRelatedData(ctx, args.roomId, caller?.user?._id);
  },
});

// Show cards (reveal the round)
export const showCards = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "revealCards" });
    await VotingRound.reveal(ctx, room);
  },
});

// Reset game (start a fresh round on the same target)
export const resetGame = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await VotingRound.reset(ctx, room);
  },
});

// Toggle auto-complete voting
export const toggleAutoComplete = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "roomSettings" });
    await VotingRound.setAutoComplete(ctx, room, !room.autoCompleteVoting);
  },
});

// Cancel the auto-reveal countdown
export const cancelAutoRevealCountdown = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "revealCards" });
    await VotingRound.cancelCountdown(ctx, room);
  },
});

// Rename a room
export const rename = mutation({
  args: {
    roomId: v.id("rooms"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "roomSettings" });
    await Rooms.renameRoom(ctx, room, args.name);
  },
});
