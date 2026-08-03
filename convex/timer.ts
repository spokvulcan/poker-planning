import { v } from "convex/values";
import { mutation } from "./_generated/server";
import * as Timer from "./model/timer";
import { requireActingUser } from "./model/auth";

// Start the timer
export const startTimer = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireActingUser(ctx, args.roomId, args.userId);
    await Timer.updateTimerState(ctx, {
      roomId: args.roomId,
      nodeId: args.nodeId,
      action: "start",
      userId: args.userId,
    });
  },
});

// Pause the timer
export const pauseTimer = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireActingUser(ctx, args.roomId, args.userId);
    await Timer.updateTimerState(ctx, {
      roomId: args.roomId,
      nodeId: args.nodeId,
      action: "pause",
      userId: args.userId,
    });
  },
});

// Reset the timer
export const resetTimer = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireActingUser(ctx, args.roomId, args.userId);
    await Timer.updateTimerState(ctx, {
      roomId: args.roomId,
      nodeId: args.nodeId,
      action: "reset",
      userId: args.userId,
    });
  },
});
