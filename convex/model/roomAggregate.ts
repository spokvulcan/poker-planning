import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { scheduleWebhookDeregistration } from "./integrations";

/**
 * The retro's five tables (ADR-0016), room-owned like the rest — the cascade
 * empties them — but permanently retained data the daily orphan sweep must
 * never walk (model/cleanup.ts takes the explicit poker list instead).
 */
export const RETRO_TABLES = [
  "retros",
  "retroCards",
  "retroClusters",
  "retroVotes",
  "retroActions",
] as const;

/**
 * The room-owned tables the daily orphan sweep walks: the poker set. Bounded
 * by the sweep's own transaction budget; the retro tables are excluded.
 */
export const ORPHAN_SWEPT_TABLES = [
  "issues",
  "roomMemberships",
  "votes",
  "canvasNodes",
  "votingTimestamps",
  "individualVotes",
  "integrationMappings",
  "roomAnalyticsSnapshots",
] as const;

/**
 * The one inventory of what a room owns: the sweep's poker tables plus the
 * retro tables.
 *
 * Every table keyed by `roomId` is a direct member. `issueLinks` is owned
 * transitively through its issue — rows written before it gained its own
 * `roomId` can only be found that way — so the cascade expands it from the
 * room's issues instead.
 *
 * Deliberately NOT room-owned: `integrationConnections` belongs to users,
 * `webhookEvents` is a global dedup table, and `users` is global identity.
 * There is no per-room presence/timer table — presence is connection-local
 * and canvas timers are `canvasNodes` rows.
 */
export const ROOM_OWNED_TABLES = [...ORPHAN_SWEPT_TABLES, ...RETRO_TABLES] as const;

export type OrphanSweptTable = (typeof ORPHAN_SWEPT_TABLES)[number];

export type RoomOwnedTable = (typeof ROOM_OWNED_TABLES)[number];

/**
 * Rows deleted per table per cascade step. Keeps every invocation well within
 * per-transaction document limits; the registered wrapper reschedules itself
 * until the step reports `done` (guideline: batch with .take + runAfter
 * continuation rather than one unbounded collect-and-delete transaction).
 */
export const ROOM_DELETE_BATCH_SIZE = 500;

export interface RoomAggregateDeleteStep {
  /** true once the room row itself is deleted — the cascade is complete. */
  done: boolean;
  /** Rows deleted by this step (the room row counts as one). */
  deleted: number;
}

/**
 * One bounded step of the room cascade, per ROOM_OWNED_TABLES. The caller
 * (internal.maintenance.deleteRoomAggregateChunk) reschedules itself while
 * the step returns `done: false`.
 *
 * Phase order is load-bearing:
 * 1. issues + their issueLinks — links expand from the room's issues, so each
 *    issue batch must go before its rows vanish (a deleted issue's links can
 *    no longer be found by index).
 * 2. the remaining by_room tables, one batch per table per step.
 * 3. the room row itself, only once every owned table reads empty.
 *
 * integrationMappings rows schedule webhook deregistration BEFORE deletion:
 * deleting the mapping alone would orphan the remote Jira webhook (it keeps
 * POSTing until its 30-day expiry). Connections belong to users, not rooms,
 * so the connection row survives the cascade and the scheduled action can
 * still authenticate the remote delete.
 */
export async function deleteRoomAggregateChunk(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  batchSize: number = ROOM_DELETE_BATCH_SIZE
): Promise<RoomAggregateDeleteStep> {
  // Phase 1: issues + their links, one batch at a time.
  const issueBatch = (await ctx.db
    .query("issues")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(batchSize)) as Doc<"issues">[];

  if (issueBatch.length > 0) {
    const links = (
      await Promise.all(
        issueBatch.map((issue) =>
          ctx.db
            .query("issueLinks")
            .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
            .collect()
        )
      )
    ).flat();
    await Promise.all([
      ...links.map((link) => ctx.db.delete(link._id)),
      ...issueBatch.map((issue) => ctx.db.delete(issue._id)),
    ]);
    return { done: false, deleted: issueBatch.length + links.length };
  }

  // Phase 2: the remaining room-owned tables, one batch per table per step.
  // The reads are independent, so they go out together.
  const tables = ROOM_OWNED_TABLES.filter((table) => table !== "issues");
  const batches = await Promise.all(
    tables.map((table) =>
      ctx.db
        .query(table)
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .take(batchSize)
    )
  );
  let deleted = 0;
  let anyFullBatch = false;
  for (const [i, table] of tables.entries()) {
    const rows = batches[i];

    if (table === "integrationMappings") {
      for (const mapping of rows as Doc<"integrationMappings">[]) {
        await scheduleWebhookDeregistration(ctx, mapping);
      }
    }

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    deleted += rows.length;
    if (rows.length === batchSize) anyFullBatch = true;
  }
  if (anyFullBatch) {
    return { done: false, deleted };
  }

  // Phase 3: the room itself, last.
  await ctx.db.delete(roomId);
  return { done: true, deleted: deleted + 1 };
}
