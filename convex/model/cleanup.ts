import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  ROOM_OWNED_TABLES,
  RoomOwnedTable,
  deleteRoomAggregate,
} from "./roomAggregate";

export interface CleanupResult {
  roomsDeleted: number;
  votesDeleted: number;
  membershipsDeleted: number;
  canvasNodesDeleted?: number;
}

/**
 * Removes inactive rooms and all associated data
 * @param inactiveDays - Number of days of inactivity before a room is considered inactive
 */
export async function removeInactiveRooms(
  ctx: MutationCtx,
  inactiveDays: number = 5
): Promise<CleanupResult> {
  const cutoffTime = Date.now() - (inactiveDays * 24 * 60 * 60 * 1000);

  // Find inactive rooms.
  const inactiveRooms = await ctx.db
    .query("rooms")
    .withIndex("by_activity", (q) => q.lt("lastActivityAt", cutoffTime))
    .collect();

  console.log(`Found ${inactiveRooms.length} inactive rooms to clean up`);

  const result: CleanupResult = {
    roomsDeleted: 0,
    votesDeleted: 0,
    membershipsDeleted: 0,
    canvasNodesDeleted: 0,
  };

  // Process each room
  for (const room of inactiveRooms) {
    const cleanupStats = await cleanupRoom(ctx, room._id);

    // Aggregate stats
    result.votesDeleted += cleanupStats.votesDeleted;
    result.membershipsDeleted += cleanupStats.membershipsDeleted;
    result.canvasNodesDeleted! += cleanupStats.canvasNodesDeleted || 0;
    result.roomsDeleted++;

    console.log(`Cleaned up room ${room.name} (${room._id})`);
  }

  return result;
}

/**
 * Cleans up all data associated with a single room.
 * The table set comes from the one room-aggregate inventory
 * (convex/model/roomAggregate.ts) — including issues, which used to leak.
 */
export async function cleanupRoom(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<Omit<CleanupResult, "roomsDeleted">> {
  const deleted = await deleteRoomAggregate(ctx, roomId);
  return {
    votesDeleted: deleted.votes,
    membershipsDeleted: deleted.roomMemberships,
    canvasNodesDeleted: deleted.canvasNodes,
  };
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
