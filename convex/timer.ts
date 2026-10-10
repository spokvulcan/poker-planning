import { v } from "convex/values";
import { mutation } from "./_generated/server";
import * as Timer from "./model/timer";
import { requireRoomWrite } from "./model/auth";

// Start the timer
export const startTimer = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    userId: v.optional(v.id("users")), // Ignored: the caller's own id, which old browsers still send
  },
  handler: async (ctx, args) => {
    const { room, user } = await requireRoomWrite(ctx, args.roomId);
    await Timer.updateTimerState(ctx, {
      room,
      nodeId: args.nodeId,
      action: "start",
      userId: user._id,
    });
  },
});

// Pause the timer
export const pauseTimer = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    userId: v.optional(v.id("users")), // Ignored: the caller's own id, which old browsers still send
  },
  handler: async (ctx, args) => {
    const { room, user } = await requireRoomWrite(ctx, args.roomId);
    await Timer.updateTimerState(ctx, {
      room,
      nodeId: args.nodeId,
      action: "pause",
      userId: user._id,
    });
  },
});

// Reset the timer
export const resetTimer = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    userId: v.optional(v.id("users")), // Ignored: the caller's own id, which old browsers still send
  },
  handler: async (ctx, args) => {
    const { room, user } = await requireRoomWrite(ctx, args.roomId);
    await Timer.updateTimerState(ctx, {
      room,
      nodeId: args.nodeId,
      action: "reset",
      userId: user._id,
    });
  },
});
