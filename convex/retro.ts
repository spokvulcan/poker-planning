import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import * as Retro from "./model/retro";
import { requireAuthUser, requireRoomReader } from "./model/auth";

/**
 * Create a teamless retro (spec §6.1): anyone, anonymous included. Returns
 * the room id; the creator holds the owner membership already.
 */
export const create = mutation({
  args: {
    name: v.string(),
    formatName: v.string(),
    collectUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAuthUser(ctx);
    return await Retro.createRetro(ctx, { ...args, ownerId: user._id });
  },
});

/**
 * The board's structure (spec §9): the retros row — format, stages, the
 * shared pointer, `collectUntil`. Room access, not attendance (ADR-0009).
 */
export const board = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
    return await Retro.getBoard(ctx, args.roomId);
  },
});
