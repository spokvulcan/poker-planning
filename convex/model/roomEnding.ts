import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import * as Integrations from "./integrations";
import * as Issues from "./issues";
import * as Presence from "./presence";

/**
 * A room's ending (CONTEXT.md: Room ending): the one way a room and what it
 * owns are deleted. Two verbs: endRoom ends one room (an owner deleting a
 * retro, a hand-off with nobody to hand the room to, the admin wipe), and
 * endStaleRooms ends what the daily sweep finds stale. Both go in bounded
 * steps, each its own transaction, and this module decides whether there is
 * a next one.
 *
 * Most of what a room owns has no rule of its own and goes by one by_room
 * delete here. Three owners have a rule and let go of their rows themselves:
 * an issue goes with its links (Issues.deleteIssueWithLinks), a mapping hands
 * its webhook to its provider's reconcile (Integrations.deleteMapping), and
 * presence lives in its component (Presence.removeRoomPresence).
 */

/**
 * Room-keyed tables with no rule of their own, outside the retro's: each
 * goes by one by_room delete, and the sweep reads them for rows whose room
 * is gone.
 */
const PLAIN_TABLES = [
  "roomMemberships",
  "votes",
  "canvasNodes",
  "votingTimestamps",
  "individualVotes",
  "roomAnalyticsSnapshots",
] as const;

/**
 * The retro's tables, plain too. They can hold retained data, and reading
 * all of them every day is not worth its cost, so the sweep never reads them
 * (ADR-0016): it finds a retro deleted some other way through its memberships
 * and canvas nodes.
 */
const RETRO_TABLES = ["retroStickies", "retroStickyVotes", "retroActionItems"] as const;

/**
 * What a room's ending deletes by room, row by row, once the room's issues
 * are gone: the plain tables, and any link an issue left behind when it went
 * before it.
 */
const BY_ROOM_TABLES = ["issueLinks", ...PLAIN_TABLES, ...RETRO_TABLES] as const;

/**
 * Every table keyed by a room, all of which a room's ending empties: the
 * issues with their links, the integration mappings through their module,
 * and the rest by room. A table that gains a `roomId` fails the inventory
 * test until its rows go with the room.
 *
 * Deliberately not here: `integrationConnections` are people's, and outlive
 * the room so a webhook's removal can still authenticate; `webhookEvents` and
 * `gifSearchUsage` are global. Presence is the room's too, but it lives in its
 * component's tables, outside the schema.
 */
export const ROOM_TABLES = ["issues", "integrationMappings", ...BY_ROOM_TABLES] as const;

/** Rows of each table one step of an ending deletes: well within a transaction's limits. */
const ENDING_BATCH = 500;

/**
 * End this room. Its ending starts in a moment and goes a step at a time,
 * each its own transaction, so a room of any size ends without putting its
 * rows into the caller's transaction.
 */
export async function endRoom(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.maintenance.deleteRoomAggregateChunk, { roomId });
}

/**
 * One step of a room's ending, run by its registered continuation
 * (internal.maintenance.deleteRoomAggregateChunk), which schedules the next
 * while anything is left. The order is load-bearing:
 * 1. issues, a batch at a time, each with its links. Links are found by
 *    issue (those from before links carried their room can be found no other
 *    way), so they go in the step their issue goes.
 * 2. a batch of every other table: the mappings through their module, which
 *    hands each one's webhook to its provider's reconcile, and the rest by
 *    room. Connections are people's, so the one that made a webhook is still
 *    there to remove it.
 * 3. once every table reads empty, the room's presence and then the room row.
 *    The memberships are gone by then, so no heartbeat writes presence for
 *    the room again. A room deleted some other way, whose rows the sweep
 *    found, has no row left to delete.
 */
export async function continueEnding(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  batchSize: number = ENDING_BATCH
): Promise<{ done: boolean }> {
  const done = await endingStep(ctx, roomId, batchSize);
  if (!done) {
    await ctx.scheduler.runAfter(0, internal.maintenance.deleteRoomAggregateChunk, { roomId, batchSize });
  }
  return { done };
}

async function endingStep(ctx: MutationCtx, roomId: Id<"rooms">, batchSize: number): Promise<boolean> {
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(batchSize);
  if (issues.length > 0) {
    await Promise.all(issues.map((issue) => Issues.deleteIssueWithLinks(ctx, issue._id)));
    return false;
  }

  // The reads are independent, so they go out together.
  const [mappings, byRoom] = await Promise.all([
    ctx.db
      .query("integrationMappings")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(batchSize),
    Promise.all(
      BY_ROOM_TABLES.map((table) =>
        ctx.db
          .query(table)
          .withIndex("by_room", (q) => q.eq("roomId", roomId))
          .take(batchSize)
      )
    ),
  ]);
  await Promise.all([
    ...mappings.map((mapping) => Integrations.deleteMapping(ctx, mapping)),
    ...BY_ROOM_TABLES.flatMap((table, i) =>
      byRoom[i].map((row) => ctx.db.delete(table, row._id as Id<typeof table>))
    ),
  ]);
  if ([mappings, ...byRoom].some((rows) => rows.length === batchSize)) return false;

  await Presence.removeRoomPresence(ctx, roomId);
  if (await ctx.db.get("rooms", roomId)) await ctx.db.delete("rooms", roomId);
  return true;
}

/** How long a room nobody keeps may go without activity before the sweep ends it. */
const QUIET_DAYS = 5;

/** Rows one page of the sweep reads. */
const SWEEP_BATCH = 100;

/**
 * What the sweep reads, a table at a time, in this order: the rooms nobody
 * keeps, for the quiet ones; then the room-keyed tables but the retro's, for
 * rows whose room is gone; last the issue links, for links whose issue is
 * gone.
 */
const SWEPT_TABLES = ["rooms", "issues", "integrationMappings", ...PLAIN_TABLES, "issueLinks"] as const;

type SweptTable = (typeof SWEPT_TABLES)[number];

/** Where the sweep is. A sweep starts with none of it. */
interface SweepProgress {
  /** The table the next page comes from. */
  table?: string;
  /** Where in it the next page starts. */
  cursor?: string;
  /** Set when the sweep starts, so every page of quiet rooms is a page of one query. */
  cutoff?: number;
  batchSize?: number;
}

/**
 * End what the sweep finds stale (cron end-stale-rooms, and after the admin
 * wipe), a page at a time, each page its own transaction, scheduling the
 * next (internal.maintenance.endStaleRooms) until the last table is read:
 * - each room nobody keeps (not retained) quiet for five days ends;
 * - a row whose room is gone, deleted some other way (by hand, or before
 *   every ending came through here), finishes that room's ending, so its
 *   owners' rules still run: webhooks removed, presence cleared;
 * - a link whose issue went before it goes, by the issue module's rule
 *   (Issues.dropLinksLeftBehind).
 *
 * Returns how many rooms this page started ending, and whether the sweep is done.
 */
export async function endStaleRooms(
  ctx: MutationCtx,
  progress: SweepProgress = {}
): Promise<{ roomsEnding: number; done: boolean }> {
  const at = SWEPT_TABLES.indexOf((progress.table ?? SWEPT_TABLES[0]) as SweptTable);
  // A table this sweep no longer reads: the list changed under it, and
  // tomorrow's sweep starts over.
  if (at < 0) return { roomsEnding: 0, done: true };
  const table = SWEPT_TABLES[at];
  const cutoff = progress.cutoff ?? Date.now() - QUIET_DAYS * 24 * 60 * 60 * 1000;
  const batchSize = progress.batchSize ?? SWEEP_BATCH;

  const page = await sweepPage(ctx, table, { numItems: batchSize, cursor: progress.cursor ?? null }, cutoff);

  const next = page.isDone ? SWEPT_TABLES[at + 1] : table;
  if (next) {
    await ctx.scheduler.runAfter(0, internal.maintenance.endStaleRooms, {
      table: next,
      cutoff,
      batchSize,
      ...(page.isDone ? {} : { cursor: page.continueCursor }),
    });
  }
  return { roomsEnding: page.roomsEnding, done: next === undefined };
}

/** One page of one table the sweep reads, and the rooms whose ending it started. */
async function sweepPage(
  ctx: MutationCtx,
  table: SweptTable,
  page: { numItems: number; cursor: string | null },
  cutoff: number
): Promise<{ roomsEnding: number; isDone: boolean; continueCursor: string }> {
  if (table === "rooms") {
    const quiet = await ctx.db
      .query("rooms")
      .withIndex("by_retention_activity", (q) => q.eq("retained", false).lt("lastActivityAt", cutoff))
      .paginate(page);
    for (const room of quiet.page) await endRoom(ctx, room._id);
    if (quiet.page.length > 0) console.log(`The sweep is ending ${quiet.page.length} quiet room(s)`);
    return { roomsEnding: quiet.page.length, isDone: quiet.isDone, continueCursor: quiet.continueCursor };
  }

  if (table === "issueLinks") {
    const links = await ctx.db.query("issueLinks").paginate(page);
    await Issues.dropLinksLeftBehind(ctx, links.page);
    return { roomsEnding: 0, isDone: links.isDone, continueCursor: links.continueCursor };
  }

  const rows = await ctx.db.query(table).paginate(page);
  let roomsEnding = 0;
  for (const roomId of new Set(rows.page.map((row) => row.roomId))) {
    if (!(await ctx.db.get("rooms", roomId))) {
      await endRoom(ctx, roomId);
      roomsEnding++;
    }
  }
  if (roomsEnding > 0) {
    console.log(`The sweep is finishing the ending of ${roomsEnding} room(s) deleted some other way (rows in ${table})`);
  }
  return { roomsEnding, isDone: rows.isDone, continueCursor: rows.continueCursor };
}
