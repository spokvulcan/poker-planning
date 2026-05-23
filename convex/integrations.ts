/**
 * Public API layer for integration connections and mappings.
 * Thin handlers with auth guards — delegates to model/DB.
 */

import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
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

    // Return sanitized — never expose encrypted tokens
    return connections.map((c) => ({
      _id: c._id,
      provider: c.provider,
      siteUrl: c.siteUrl,
      providerUserEmail: c.providerUserEmail,
      connectedAt: c.connectedAt,
      scopes: c.scopes,
    }));
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

    // Cascade delete all mappings using this connection
    const mappings = await ctx.db
      .query("integrationMappings")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", args.connectionId)
      )
      .collect();
    await Promise.all(mappings.map((m) => ctx.db.delete(m._id)));

    await ctx.db.delete(args.connectionId);
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

    // Upsert: check for existing mapping
    const existing = await ctx.db
      .query("integrationMappings")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        connectionId: args.connectionId,
        provider: args.provider,
        jiraProjectKey: args.jiraProjectKey,
        jiraBoardId: args.jiraBoardId,
        jiraSprintId: args.jiraSprintId,
        storyPointsFieldId: args.storyPointsFieldId,
        autoImport: args.autoImport,
        autoPushEstimates: args.autoPushEstimates,
      });

      // Schedule webhook registration if auto-push enabled
      if (args.autoPushEstimates && args.jiraProjectKey) {
        await ctx.scheduler.runAfter(
          0,
          internal.integrations.jira.registerWebhook,
          {
            mappingId: existing._id,
          }
        );
      }

      return existing._id;
    }

    const mappingId = await ctx.db.insert("integrationMappings", {
      roomId: args.roomId,
      connectionId: args.connectionId,
      provider: args.provider,
      jiraProjectKey: args.jiraProjectKey,
      jiraBoardId: args.jiraBoardId,
      jiraSprintId: args.jiraSprintId,
      storyPointsFieldId: args.storyPointsFieldId,
      autoImport: args.autoImport,
      autoPushEstimates: args.autoPushEstimates,
      createdAt: Date.now(),
    });

    // Schedule webhook registration if auto-push enabled
    if (args.autoPushEstimates && args.jiraProjectKey) {
      await ctx.scheduler.runAfter(
        0,
        internal.integrations.jira.registerWebhook,
        {
          mappingId,
        }
      );
    }

    return mappingId;
  },
});

export const removeRoomMapping = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "roomSettings" });

    const mapping = await ctx.db
      .query("integrationMappings")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .first();

    if (mapping) {
      await ctx.db.delete(mapping._id);
    }
  },
});
