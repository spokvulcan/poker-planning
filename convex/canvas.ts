import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import * as Canvas from "./model/canvas";
import { requireRoomMember } from "./model/auth";

// Initialize canvas nodes when a canvas room is created
export const initializeCanvasNodes = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    await Canvas.initializeCanvasNodes(ctx, args);
  },
});

// Get all canvas nodes for a room
export const getCanvasNodes = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await Canvas.getCanvasNodes(ctx, args.roomId);
  },
});

// Update node position
export const updateNodePosition = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    position: v.object({ x: v.number(), y: v.number() }),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRoomMember(ctx, args.roomId);
    if (user._id !== args.userId) {
      throw new Error("Cannot act as another user");
    }
    await Canvas.updateNodePosition(ctx, args);
  },
});

// Create or update player node
export const upsertPlayerNode = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
    position: v.optional(v.object({ x: v.number(), y: v.number() })),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRoomMember(ctx, args.roomId);
    if (user._id !== args.userId) {
      throw new Error("Cannot act as another user");
    }
    return await Canvas.upsertPlayerNode(ctx, args);
  },
});

// Create or update results node
export const upsertResultsNode = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    return await Canvas.upsertResultsNode(ctx, args);
  },
});

// Remove player node when user leaves
export const removePlayerNode = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRoomMember(ctx, args.roomId);
    if (user._id !== args.userId) {
      throw new Error("Cannot act as another user");
    }
    await Canvas.removePlayerNode(ctx, args);
  },
});

// Lock/unlock node
export const toggleNodeLock = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    locked: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    await Canvas.toggleNodeLock(ctx, args);
  },
});

// Create a note node for an issue
export const createNote = mutation({
  args: {
    roomId: v.id("rooms"),
    issueId: v.id("issues"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRoomMember(ctx, args.roomId);
    if (user._id !== args.userId) {
      throw new Error("Cannot act as another user");
    }
    return await Canvas.createNoteNode(ctx, args);
  },
});

// Update note content
export const updateNoteContent = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    content: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRoomMember(ctx, args.roomId);
    if (user._id !== args.userId) {
      throw new Error("Cannot act as another user");
    }
    await Canvas.updateNoteContent(ctx, args);
  },
});

// Get note content for an issue (for export)
// Requires room membership: note contents are private to the room.
export const getNoteContentForIssue = query({
  args: {
    roomId: v.id("rooms"),
    issueId: v.id("issues"),
  },
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    return await Canvas.getNoteContentForIssue(ctx, args);
  },
});

// Delete a note node
export const deleteNote = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRoomMember(ctx, args.roomId);
    if (user._id !== args.userId) {
      throw new Error("Cannot act as another user");
    }
    await Canvas.deleteNoteNode(ctx, args);
  },
});
