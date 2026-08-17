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

    // Fetch the room's links ONCE via by_room instead of one by_issue query
    // per issue. Link rows that predate the roomId field are invisible to
    // by_room, so uncovered issues fall back to a per-issue lookup.
    const roomLinks = await ctx.db
      .query("issueLinks")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    const linkByIssue = new Map(roomLinks.map((l) => [l.issueId as string, l]));

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    const result: Record<
      string,
      {
        _id: string;
        provider: string;
        externalId: string;
        externalUrl: string;
      }
    > = {};

    for (const issue of issues) {
      const link =
        linkByIssue.get(issue._id) ??
        (await ctx.db
          .query("issueLinks")
          .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
          .first());
      if (link) {
        result[issue._id] = {
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

    // The public args keep the Jira column names (the UI is the Jira mapping
    // form); the model routes on provider-neutral names.
    return await Integrations.saveRoomMapping(ctx, {
      roomId: args.roomId,
      connectionId: args.connectionId,
      provider: args.provider,
      projectKey: args.jiraProjectKey,
      boardId: args.jiraBoardId,
      sprintId: args.jiraSprintId,
      storyPointsFieldId: args.storyPointsFieldId,
      autoImport: args.autoImport,
      autoPushEstimates: args.autoPushEstimates,
    });
  },
});

export const removeRoomMapping = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "roomSettings" });

    await Integrations.removeRoomMapping(ctx, args.roomId);
  },
});
