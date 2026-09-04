import { MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { ROOM_OWNED_TABLES, RoomOwnedTable } from "./roomAggregate";

export interface RemoveInactiveRoomsResult {
  /** Rooms whose cascade was scheduled (each runs as its own mutation). */
  roomsScheduled: number;
}

/**
 * How many inactive rooms one cron tick hands to the cascade. The rest are
 * picked up by the next daily run — bounding the scan keeps the cron mutation
 * small no matter how many rooms went stale at once.
 */
const INACTIVE_ROOMS_PER_TICK = 100;

/**
 * Schedules deletion of non-retained inactive rooms (default 5 days of
 * inactivity). A retained room (ADR-0019: one that belongs to a Team) is
 * never swept, whatever its age or type. Each room's cascade runs as its own
 * scheduled mutation
 * (internal.maintenance.deleteRoomAggregateChunk), so one oversized or
 * failing room can neither blow the cron's transaction limits nor take the
 * other rooms down with it.
 */
export async function removeInactiveRooms(
  ctx: MutationCtx,
  inactiveDays: number = 5
): Promise<RemoveInactiveRoomsResult> {
  const cutoffTime = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;

  const inactiveRooms = await ctx.db
    .query("rooms")
    .withIndex("by_retention_activity", (q) =>
      q.eq("retained", false).lt("lastActivityAt", cutoffTime)
    )
    .take(INACTIVE_ROOMS_PER_TICK);

  console.log(`Scheduling ${inactiveRooms.length} inactive rooms for cleanup`);

  for (const room of inactiveRooms) {
    await ctx.scheduler.runAfter(
      0,
      internal.maintenance.deleteRoomAggregateChunk,
      { roomId: room._id }
    );
  }

  return { roomsScheduled: inactiveRooms.length };
}

/**
 * Removes orphaned data (data without associated rooms)
 * Optimized to avoid N+1 queries by batching room existence checks
 */
export async function cleanupOrphanedData(ctx: MutationCtx): Promise<{
  orphanedVotes: number;
  orphanedMemberships: number;
  orphanedCanvasNodes: number;
  orphanedVotingTimestamps: number;
  orphanedIndividualVotes: number;
  orphanedIntegrationMappings: number;
  orphanedRoomAnalyticsSnapshots: number;
  orphanedIssues: number;
  orphanedIssueLinks: number;
}> {
  // Get all existing room IDs once
  const allRooms = await ctx.db.query("rooms").collect();
  const existingRoomIds = new Set(allRooms.map(room => room._id));

  // Sweep every room-owned table — the same inventory the room cascade uses.
  const swept = {} as Record<RoomOwnedTable, number>;
  await Promise.all(
    ROOM_OWNED_TABLES.map(async (table) => {
      swept[table] = await cleanupOrphanedRecords(
        ctx,
        table,
        (doc) => !existingRoomIds.has(doc.roomId)
      );
    })
  );

  // issueLinks are room-owned through their issue: a link is orphaned once its
  // issue is gone. Runs after the issue sweep above, so links left behind by
  // just-swept issues are collected too.
  const remainingIssues = await ctx.db.query("issues").collect();
  const existingIssueIds = new Set(remainingIssues.map((issue) => issue._id));
  const orphanedIssueLinks = await cleanupOrphanedRecords(
    ctx,
    "issueLinks",
    (doc) => !existingIssueIds.has(doc.issueId)
  );

  return {
    orphanedVotes: swept.votes,
    orphanedMemberships: swept.roomMemberships,
    orphanedCanvasNodes: swept.canvasNodes,
    orphanedVotingTimestamps: swept.votingTimestamps,
    orphanedIndividualVotes: swept.individualVotes,
    orphanedIntegrationMappings: swept.integrationMappings,
    orphanedRoomAnalyticsSnapshots: swept.roomAnalyticsSnapshots,
    orphanedIssues: swept.issues,
    orphanedIssueLinks,
  };
}

/**
 * Helper function to clean orphaned records from a specific table.
 * One full scan per table: the old loop re-collected the entire table once
 * per 100-row batch (O(n²)), and batching buys nothing inside a single
 * transaction anyway. Carrying a `.paginate()` cursor instead is not an
 * option — Convex allows only one paginated query per function execution,
 * and the sweep touches several tables per run.
 */
async function cleanupOrphanedRecords<Table extends RoomOwnedTable | "issueLinks">(
  ctx: MutationCtx,
  tableName: Table,
  isOrphan: (doc: Doc<Table>) => boolean
): Promise<number> {
  const docs = await ctx.db.query(tableName).collect();

  const deletePromises: Promise<void>[] = [];
  for (const doc of docs) {
    if (isOrphan(doc)) {
      deletePromises.push(ctx.db.delete(doc._id));
    }
  }

  // Execute deletions in parallel
  await Promise.all(deletePromises);

  return deletePromises.length;
}
