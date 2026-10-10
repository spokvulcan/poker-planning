import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import * as Issues from "./model/issues";
import * as VotingRound from "./model/votingRound";
import { requireRoomReader, requireRoomWrite } from "./model/auth";

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
 * Get issues formatted for export.
 * Requires room access (ADR-0009): the export includes discussion-note contents.
 */
export const getForExport = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
    return await Issues.getIssuesForExport(ctx, args.roomId);
  },
});

/**
 * Get issues with enhanced data for export (time-to-consensus, individual votes, voting rounds).
 * Requires room access (ADR-0009) since it exposes per-user voting data.
 */
export const getForEnhancedExport = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
    return await Issues.getEnhancedIssuesForExport(ctx, args.roomId);
  },
});

/**
 * Create a new issue, typed in the room: the same admission as an import, with
 * no link.
 */
export const create = mutation({
  args: {
    roomId: v.id("rooms"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "issueManagement" });
    const admission = await Issues.admitIssue(ctx, args);
    return admission.issueId;
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
    const { room, issue } = await requireRoomWrite(
      ctx,
      { issue: args.issueId },
      { kind: "category", category: "issueManagement" }
    );
    await Issues.updateIssueTitle(ctx, room, issue, args.title);
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
    const { room, issue } = await requireRoomWrite(
      ctx,
      { issue: args.issueId },
      { kind: "category", category: "issueManagement" }
    );
    await Issues.updateIssueEstimate(ctx, room, issue, args.finalEstimate);
  },
});

/**
 * Delete an issue
 */
export const remove = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const { room, issue } = await requireRoomWrite(
      ctx,
      { issue: args.issueId },
      { kind: "category", category: "issueManagement" }
    );
    await Issues.removeIssue(ctx, room, issue);
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
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await VotingRound.start(ctx, { room, issueId: args.issueId });
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
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "issueManagement" });
    await Issues.reorderIssues(ctx, room, args.issueIds);
  },
});

/**
 * Clear current issue (switch to Quick Vote mode). This is an abandon of the
 * current round, owned by the voting-round module.
 */
export const clearCurrentIssue = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await VotingRound.abandon(ctx, room);
  },
});
