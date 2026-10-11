import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import * as RoundClock from "./model/roundClock";
import { requireRoomReader, requireRoomWrite } from "./model/auth";

/**
 * A poker room's round clock (ADR-0032): the facts the timer and session
 * time nodes read, and the timebox and pause, which run the room's game flow.
 */

/** The clock's facts, for the browser to read against its own clock. Room contents: readers only (ADR-0009). */
export const get = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireRoomReader(ctx, args.roomId);
    return await RoundClock.clockOf(ctx, args.roomId);
  },
});

/** Flips the sand timer for everyone. */
export const startTimebox = mutation({
  args: { roomId: v.id("rooms"), durationMs: v.number() },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await RoundClock.startTimebox(ctx, room, args.durationMs);
  },
});

/** Adds a minute to the timebox. */
export const extendTimebox = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await RoundClock.extendTimebox(ctx, room);
  },
});

/** Puts the timebox away. */
export const stopTimebox = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await RoundClock.stopTimebox(ctx, room);
  },
});

/** Calls a break: the clock stops for everyone. */
export const pause = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await RoundClock.pause(ctx, room);
  },
});

/** Ends the break. */
export const resume = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const { room } = await requireRoomWrite(ctx, args.roomId, { kind: "category", category: "gameFlow" });
    await RoundClock.resume(ctx, room);
  },
});
