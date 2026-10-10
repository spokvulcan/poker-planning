import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import * as Canvas from "./model/canvas";
import { requireRoomReader, requireActingUser } from "./model/auth";
import { positionValidator } from "./schema";

// Get all canvas nodes for a room
// Requires room access (ADR-0009): note contents are private to the room.
export const getCanvasNodes = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
    return await Canvas.getCanvasNodes(ctx, args.roomId);
  },
});

/** Puts every node a drop moved where it was dropped, in one write. */
export const moveNodes = mutation({
  args: {
    roomId: v.id("rooms"),
    moves: v.array(v.object({ nodeId: v.string(), position: positionValidator })),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { room, user } = await requireActingUser(ctx, args.roomId, args.userId);
    await Canvas.moveNodes(ctx, room, args.moves, user._id);
  },
});

/** One node's move: what a browser from before `moveNodes` still sends. */
export const updateNodePosition = mutation({
  args: {
    roomId: v.id("rooms"),
    nodeId: v.string(),
    position: positionValidator,
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { room, user } = await requireActingUser(ctx, args.roomId, args.userId);
    await Canvas.moveNodes(ctx, room, [{ nodeId: args.nodeId, position: args.position }], user._id);
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
    const { room, user } = await requireActingUser(ctx, args.roomId, args.userId);
    return await Canvas.createNote(ctx, room, args.issueId, user);
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
    const { room, user } = await requireActingUser(ctx, args.roomId, args.userId);
    await Canvas.updateNote(ctx, room, args.nodeId, args.content, user);
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
    const { room } = await requireActingUser(ctx, args.roomId, args.userId);
    await Canvas.deleteNote(ctx, room, args.nodeId);
  },
});
