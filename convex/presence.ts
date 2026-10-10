import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireRoomWrite } from "./model/auth";
import { presence } from "./model/presence";

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(), // The caller's own id: the presence hook finds itself in the room's list by it, so it is checked, not ignored
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    // The presence component lists whoever a heartbeat names, so a heartbeat
    // must name the caller the step seats in this room — otherwise any client
    // could spoof another user's online status or inject phantom presence
    // into arbitrary rooms.
    const { user } = await requireRoomWrite(ctx, roomId as Id<"rooms">);
    if (user._id !== userId) {
      throw new Error("Cannot heartbeat as another user");
    }
    return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
  },
});

export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    return await presence.list(ctx, roomToken);
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    return await presence.disconnect(ctx, sessionToken);
  },
});
