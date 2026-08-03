/**
 * Public API layer for integration connections and mappings.
 * Thin handlers with auth guards — delegates to model/integrations.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import * as Integrations from "./model/integrations";
import { requireAuthUser, requireRoomMember, requireCan } from "./model/auth";

// ---------------------------------------------------------------------------
// Connection queries & mutations
// ---------------------------------------------------------------------------

export const getConnections = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireAuthUser(ctx);
    const connections = await ctx.db
      .query("integrationConnections")
      .withIndex("by_user_provider", (q) => q.eq("userId", user._id))
      .collect();

    // Sanitized projection — never expose encrypted tokens
    return connections.map(Integrations.toConnectionView);
  },
});

export const disconnect = mutation({
  args: { connectionId: v.id("integrationConnections") },
  handler: async (ctx, args) => {
    const { user } = await requireAuthUser(ctx);
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== user._id) {
      throw new Error("Connection not found");
    }

    await Integrations.disconnectConnection(ctx, args.connectionId);
  },
});

// ---------------------------------------------------------------------------
// Room mapping queries & mutations
// ---------------------------------------------------------------------------

export const getRoomMapping = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    return await ctx.db
      .query("integrationMappings")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .first();
  },
});

export const getIssueLinks = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    const links = await Promise.all(
      issues.map((issue) =>
        ctx.db
          .query("issueLinks")
          .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
          .first()
      )
    );

    // Return map of issueId -> link
    const result: Record<
      string,
      {
        _id: string;
        provider: string;
        externalId: string;
        externalUrl: string;
      }
    > = {};

    for (let i = 0; i < issues.length; i++) {
      const link = links[i];
      if (link) {
        result[issues[i]._id] = {
          _id: link._id,
          provider: link.provider,
          externalId: link.externalId,
          externalUrl: link.externalUrl,
        };
      }
    }

    return result;
  },
});

export const saveRoomMapping = mutation({
  args: {
    roomId: v.id("rooms"),
    connectionId: v.id("integrationConnections"),
    provider: v.union(v.literal("jira"), v.literal("github")),
    jiraProjectKey: v.optional(v.string()),
    jiraBoardId: v.optional(v.number()),
    jiraSprintId: v.optional(v.number()),
    storyPointsFieldId: v.optional(v.string()),
    autoImport: v.boolean(),
    autoPushEstimates: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "roomSettings" });

    // Verify the connection belongs to the current user
    const { user } = await requireAuthUser(ctx);
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== user._id) {
      throw new Error("Connection not found");
    }

    return await Integrations.saveRoomMapping(ctx, args);
  },
});

export const removeRoomMapping = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "roomSettings" });

    await Integrations.removeRoomMapping(ctx, args.roomId);
  },
});
