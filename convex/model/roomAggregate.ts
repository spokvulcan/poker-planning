import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import * as Integrations from "./integrations";
import * as Issues from "./issues";
import * as Presence from "./presence";

/**
 * The retro's tables, room-owned like the rest — the cascade empties them —
 * but possibly retained data the daily orphan sweep never walks (the sweep
 * takes the explicit poker list instead).
 */
export const RETRO_TABLES = [
  "retroStickies",
  "retroStickyVotes",
  "retroActionItems",
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
 * `roomId` can only be found that way — so the cascade deletes each issue
 * through the issue module, which deletes its links with it.
 *
 * Deliberately NOT room-owned: `integrationConnections` belongs to users,
 * `webhookEvents` is a global dedup table, and `users` is global identity.
 * Canvas timers are `canvasNodes` rows. Presence is room-owned too, but it
 * lives in the presence component's tables rather than the app schema, so it
 * can't be listed here: the cascade removes it through the component's API
 * just before the room row.
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

/**
 * Deletes a room and everything it owns, in bounded steps
 * (internal.maintenance.deleteRoomAggregateChunk reschedules itself until
 * the cascade is done). The one way a room is deleted: the sweep, an owner
 * deleting it, and a hand-off with nobody to hand to all come through here.
 */
export async function scheduleRoomDeletion(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.maintenance.deleteRoomAggregateChunk, { roomId });
}

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
 * 1. issues, each with its issueLinks — through the issue module, which finds
 *    the links by issue, so they go in the same step as their issue (a
 *    deleted issue's links can no longer be found by index).
 * 2. the remaining by_room tables, one batch per table per step.
 * 3. the room's presence, then the room row itself, only once every owned
 *    table reads empty. Memberships are gone by then, so no heartbeat can
 *    write presence for the room again.
 *
 * integrationMappings rows are deleted through Integrations.deleteMapping,
 * which hands each one's webhook to the provider's reconcile. Connections
 * belong to users, not rooms, so the connection row survives the cascade and
 * the webhook's removal can still authenticate with it.
 */
export async function deleteRoomAggregateChunk(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  batchSize: number = ROOM_DELETE_BATCH_SIZE
): Promise<RoomAggregateDeleteStep> {
  // Phase 1: issues, each with its links, one batch at a time.
  const issueBatch = (await ctx.db
    .query("issues")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(batchSize)) as Doc<"issues">[];

  if (issueBatch.length > 0) {
    const deleted = await Promise.all(
      issueBatch.map((issue) => Issues.deleteIssueWithLinks(ctx, issue._id))
    );
    return { done: false, deleted: deleted.reduce((sum, rows) => sum + rows, 0) };
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
      await Promise.all(
        (rows as Doc<"integrationMappings">[]).map((mapping) => Integrations.deleteMapping(ctx, mapping))
      );
    } else {
      await Promise.all(rows.map((row) => ctx.db.delete(table, row._id as Id<typeof table>)));
    }
    deleted += rows.length;
    if (rows.length === batchSize) anyFullBatch = true;
  }
  if (anyFullBatch) {
    return { done: false, deleted };
  }

  // Phase 3: the room's presence, then the room itself, last.
  await Presence.removeRoomPresence(ctx, roomId);
  await ctx.db.delete("rooms", roomId);
  return { done: true, deleted: deleted + 1 };
}
