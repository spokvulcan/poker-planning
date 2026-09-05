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

/**
 * Readiness (ADR-0010, spec §7): a person's "I am done with this stage"
 * signal, held in the presence payload as `{ stageId, ready }` and never in
 * a table. One write per state change; a reader treats a payload whose
 * `stageId` is not the current entry as absent, so an advance clears every
 * signal with no write at all. The same guard as the heartbeat: the caller
 * must be this room member acting as themselves.
 */
export const setReadiness = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
    stageId: v.string(),
    ready: v.boolean(),
  },
  handler: async (ctx, { roomId, userId, stageId, ready }) => {
    await requireActingUser(ctx, roomId, userId, "Cannot set readiness as another user");
    await presence.updateRoomUser(ctx, roomId, userId, { stageId, ready });
    return null;
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
