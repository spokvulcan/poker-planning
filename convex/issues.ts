import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import * as Issues from "./model/issues";
import { requireRoomMember, requireCan } from "./model/auth";

/**
 * List all issues for a room, ordered by their order field
 */
export const list = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await Issues.listIssues(ctx, args.roomId);
  },
});

/**
 * Get the current issue being voted on
 */
export const getCurrent = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await Issues.getCurrentIssue(ctx, args.roomId);
  },
});

/**
 * Get issues formatted for export
 */
export const getForExport = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await Issues.getIssuesForExport(ctx, args.roomId);
  },
});

/**
 * Get issues with enhanced data for export (time-to-consensus, individual votes, voting rounds).
 * Requires room membership since it exposes per-user voting data.
 */
export const getForEnhancedExport = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    return await Issues.getEnhancedIssuesForExport(ctx, args.roomId);
  },
});

/**
 * Create a new issue
 */
export const create = mutation({
  args: {
    roomId: v.id("rooms"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "issueManagement" });
    return await Issues.createIssue(ctx, args);
  },
});

/**
 * Update an issue's title
 */
export const updateTitle = mutation({
  args: {
    issueId: v.id("issues"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");
    await requireCan(ctx, issue.roomId, { kind: "category", category: "issueManagement" });
    await Issues.updateIssueTitle(ctx, args);
  },
});

/**
 * Update an issue's final estimate (manual override)
 */
export const updateEstimate = mutation({
  args: {
    issueId: v.id("issues"),
    finalEstimate: v.string(),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");
    await requireCan(ctx, issue.roomId, { kind: "category", category: "issueManagement" });
    await Issues.updateIssueEstimate(ctx, args);
  },
});

/**
 * Delete an issue
 */
export const remove = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");
    await requireCan(ctx, issue.roomId, { kind: "category", category: "issueManagement" });
    await Issues.removeIssue(ctx, args.issueId);
  },
});

/**
 * Start voting on an issue
 */
export const startVoting = mutation({
  args: {
    roomId: v.id("rooms"),
    issueId: v.id("issues"),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await Issues.startVotingOnIssue(ctx, args);
  },
});

/**
 * Reorder issues (for drag-and-drop)
 */
export const reorder = mutation({
  args: {
    roomId: v.id("rooms"),
    issueIds: v.array(v.id("issues")),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "issueManagement" });
    await Issues.reorderIssues(ctx, args);
  },
});

/**
 * Clear current issue (switch to Quick Vote mode)
 */
export const clearCurrentIssue = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireCan(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await Issues.clearCurrentIssue(ctx, args.roomId);
  },
});
