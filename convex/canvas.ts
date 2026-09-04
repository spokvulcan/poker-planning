import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import * as Canvas from "./model/canvas";
import { requireRoomReader, requireActingUser } from "./model/auth";

// Get all canvas nodes for a room
// Requires room access (ADR-0009): note contents are private to the room.
export const getCanvasNodes = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
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
    await requireActingUser(ctx, args.roomId, args.userId);
    await Canvas.updateNodePosition(ctx, args);
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
    await requireActingUser(ctx, args.roomId, args.userId);
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
    await requireActingUser(ctx, args.roomId, args.userId);
    await Canvas.updateNoteContent(ctx, args);
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
    await requireActingUser(ctx, args.roomId, args.userId);
    await Canvas.deleteNoteNode(ctx, args);
  },
});
