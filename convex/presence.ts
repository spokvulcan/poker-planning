import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { Presence } from "@convex-dev/presence";
import { requireActingUser } from "./model/auth";

export const presence = new Presence(components.presence);

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    // The presence component accepts bare strings, so verify the caller is
    // actually this room member before heartbeating as them — otherwise any
    // client could spoof another user's online status or inject phantom
    // presence into arbitrary rooms.
    await requireActingUser(
      ctx,
      roomId as Id<"rooms">,
      userId as Id<"users">,
      "Cannot heartbeat as another user"
    );
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
