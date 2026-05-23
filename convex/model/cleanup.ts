import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

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
 * Cleans up all data associated with a single room
 */
export async function cleanupRoom(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<Omit<CleanupResult, "roomsDeleted">> {
  // Get all related data in parallel
  const [votes, memberships, canvasNodes, votingTimestamps, individualVotes, issues, integrationMappings] = await Promise.all([
    ctx.db
      .query("votes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
    ctx.db
      .query("roomMemberships")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
    ctx.db
      .query("canvasNodes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
    ctx.db
      .query("votingTimestamps")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
    ctx.db
      .query("individualVotes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
    ctx.db
      .query("issues")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
    ctx.db
      .query("integrationMappings")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
  ]);

  // Batch-query issueLinks for all issues in this room
  const allIssueLinks = await Promise.all(
    issues.map((issue) =>
      ctx.db
        .query("issueLinks")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .collect()
    )
  );
  const issueLinks = allIssueLinks.flat();

  // Delete all related data in parallel
  const deletePromises: Promise<void>[] = [];

  // Delete votes
  deletePromises.push(...votes.map((vote) => ctx.db.delete(vote._id)));

  // Delete memberships (not global users - they persist)
  deletePromises.push(...memberships.map((m) => ctx.db.delete(m._id)));

  // Delete canvas nodes
  deletePromises.push(...canvasNodes.map((node) => ctx.db.delete(node._id)));

  // Delete voting timestamps
  deletePromises.push(...votingTimestamps.map((ts) => ctx.db.delete(ts._id)));

  // Delete individual vote snapshots
  deletePromises.push(...individualVotes.map((iv) => ctx.db.delete(iv._id)));

  // Delete integration mappings
  deletePromises.push(...integrationMappings.map((m) => ctx.db.delete(m._id)));

  // Delete issue links
  deletePromises.push(...issueLinks.map((link) => ctx.db.delete(link._id)));

  // Wait for all deletions to complete
  await Promise.all(deletePromises);

  // Delete the room itself
  await ctx.db.delete(roomId);

  return {
    votesDeleted: votes.length,
    membershipsDeleted: memberships.length,
    canvasNodesDeleted: canvasNodes.length,
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
}> {
  // Get all existing room IDs once
  const allRooms = await ctx.db.query("rooms").collect();
  const existingRoomIds = new Set(allRooms.map(room => room._id));

  // Process each table in parallel
  const [
    orphanedVotes,
    orphanedMemberships,
    orphanedCanvasNodes,
    orphanedVotingTimestamps,
    orphanedIndividualVotes,
    orphanedIntegrationMappings,
  ] = await Promise.all([
    // Clean orphaned votes
    cleanupOrphanedRecords(ctx, "votes", existingRoomIds),
    // Clean orphaned memberships
    cleanupOrphanedRecords(ctx, "roomMemberships", existingRoomIds),
    // Clean orphaned canvas nodes
    cleanupOrphanedRecords(ctx, "canvasNodes", existingRoomIds),
    // Clean orphaned voting timestamps
    cleanupOrphanedRecords(ctx, "votingTimestamps", existingRoomIds),
    // Clean orphaned individual votes
    cleanupOrphanedRecords(ctx, "individualVotes", existingRoomIds),
    // Clean orphaned integration mappings
    cleanupOrphanedRecords(ctx, "integrationMappings", existingRoomIds),
  ]);

  return {
    orphanedVotes,
    orphanedMemberships,
    orphanedCanvasNodes,
    orphanedVotingTimestamps,
    orphanedIndividualVotes,
    orphanedIntegrationMappings,
  };
}

/**
 * Helper function to clean orphaned records from a specific table
 * Processes records in batches to avoid overwhelming the system
 */
async function cleanupOrphanedRecords(
  ctx: MutationCtx,
  tableName: "votes" | "roomMemberships" | "canvasNodes" | "votingTimestamps" | "individualVotes" | "integrationMappings",
  existingRoomIds: Set<Id<"rooms">>
): Promise<number> {
  const BATCH_SIZE = 100;
  let orphanedCount = 0;
  let hasMore = true;
  let lastId: string | undefined;

  while (hasMore) {
    // Query a batch of records
    const query = ctx.db.query(tableName);

    // For pagination, we'll use the ID as a cursor
    // This is more efficient than using skip/take
    if (lastId) {
      // Get records after the last processed ID
      const records = await query.collect();
      const startIndex = records.findIndex(r => r._id > lastId!) + 1;
      const batch = records.slice(startIndex, startIndex + BATCH_SIZE);

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Process the batch
      const deletePromises: Promise<void>[] = [];
      for (const record of batch) {
        if (!existingRoomIds.has(record.roomId)) {
          deletePromises.push(ctx.db.delete(record._id));
          orphanedCount++;
        }
      }

      // Execute deletions in parallel
      await Promise.all(deletePromises);

      // Update cursor
      lastId = batch[batch.length - 1]._id;
      hasMore = batch.length === BATCH_SIZE;
    } else {
      // First batch
      const batch = await query.take(BATCH_SIZE);

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Process the batch
      const deletePromises: Promise<void>[] = [];
      for (const record of batch) {
        if (!existingRoomIds.has(record.roomId)) {
          deletePromises.push(ctx.db.delete(record._id));
          orphanedCount++;
        }
      }

      // Execute deletions in parallel
      await Promise.all(deletePromises);

      // Update cursor
      lastId = batch[batch.length - 1]._id;
      hasMore = batch.length === BATCH_SIZE;
    }
  }

  return orphanedCount;
}
