import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import * as RoomEnding from "./model/roomEnding";

/**
 * One bounded step of a room's ending (model/roomEnding.ts), which schedules
 * the next step itself until the room is gone. The name predates that module
 * and stays: a step scheduled before a deploy must still find its function.
 */
export const deleteRoomAggregateChunk = internalMutation({
  args: {
    roomId: v.id("rooms"),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await RoomEnding.continueEnding(ctx, args.roomId, args.batchSize);
  },
});

/**
 * One page of the daily sweep (cron end-stale-rooms), which ends what is
 * stale and schedules its next page itself until done (model/roomEnding.ts).
 */
export const endStaleRooms = internalMutation({
  args: {
    table: v.optional(v.string()),
    cursor: v.optional(v.string()),
    cutoff: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await RoomEnding.endStaleRooms(ctx, args);
  },
});
