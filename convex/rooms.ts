import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import * as Rooms from "./model/rooms";
import * as VotingRound from "./model/votingRound";
import {
  requireAuth,
  requireAuthUser,
  requireCan,
} from "./model/auth";

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
    const { user } = await requireAuthUser(ctx);
    return await Rooms.createRoom(ctx, { ...args, ownerId: user._id });
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
    let currentUserId;
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      const appUser = await ctx.db
        .query("users")
        .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
        .first();
      currentUserId = appUser?._id;
    }
    return await Rooms.getRoomWithRelatedData(ctx, args.roomId, currentUserId);
  },
});

// Get rooms for the current user
export const getUserRooms = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    return await Rooms.getUserRooms(ctx, identity.subject);
  },
});

// Update room activity
export const updateActivity = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await Rooms.updateRoomActivity(ctx, args.roomId);
  },
});

// Show cards (reveal the round)
export const showCards = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "revealCards" });
    await VotingRound.reveal(ctx, args.roomId);
  },
});

// Reset game (start a fresh round on the same target)
export const resetGame = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await VotingRound.reset(ctx, args.roomId);
  },
});

// Toggle auto-complete voting
export const toggleAutoComplete = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireCan(ctx, args.roomId, { kind: "category", category: "roomSettings" });
    // Toggling cancels any active countdown (one seam), then flips the setting.
    await VotingRound.cancelCountdown(ctx, args.roomId);
    await ctx.db.patch(args.roomId, {
      autoCompleteVoting: !room.autoCompleteVoting,
    });
  },
});

// Cancel the auto-reveal countdown
export const cancelAutoRevealCountdown = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "revealCards" });
    await VotingRound.cancelCountdown(ctx, args.roomId);
  },
});

// Rename a room
export const rename = mutation({
  args: {
    roomId: v.id("rooms"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "roomSettings" });
    await ctx.db.patch(args.roomId, {
      name: args.name,
      lastActivityAt: Date.now(),
    });
  },
});
