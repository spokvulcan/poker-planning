import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import * as Cleanup from "./model/cleanup";
import * as RoomAggregate from "./model/roomAggregate";
import * as Teams from "./model/teams";

/**
 * One bounded step of a room's cascade delete; reschedules itself until the
 * step reports done. Each invocation stays within per-transaction limits, so
 * even a pathological room (500 issues, thousands of votes) deletes in
 * batches instead of throwing and rolling back an all-or-nothing cascade.
 */
export const deleteRoomAggregateChunk = internalMutation({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const step = await RoomAggregate.deleteRoomAggregateChunk(ctx, args.roomId);
    if (!step.done) {
      await ctx.scheduler.runAfter(
        0,
        internal.maintenance.deleteRoomAggregateChunk,
        { roomId: args.roomId }
      );
    }
    return step;
  },
});

/**
 * Internal mutation to clean up orphaned data
 * This should be called periodically or manually by administrators
 */
export const cleanupOrphanedData = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log("Starting orphaned data cleanup...");
    const result = await Cleanup.cleanupOrphanedData(ctx);
    console.log("Orphaned data cleanup complete:", result);
    return result;
  },
});

/**
 * One bounded step of a team's cascade (memberships, then the team row);
 * reschedules itself until the step reports done. The team's rooms were
 * handed to deleteRoomAggregateChunk by the mutation that started this.
 */
export const deleteTeamChunk = internalMutation({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const step = await Teams.deleteTeamChunk(ctx, args.teamId);
    if (!step.done) {
      await ctx.scheduler.runAfter(0, internal.maintenance.deleteTeamChunk, {
        teamId: args.teamId,
      });
    }
    return step;
  },
});
