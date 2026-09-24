/**
 * One-shot data migrations, run manually with `npx convex run migrations:<name>`
 * (add `--prod` for the production deployment). Each is idempotent and safe to
 * re-run.
 */

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v, type GenericId } from "convex/values";

/**
 * Backfills `issueLinks.roomId` from the parent issue. The field was added
 * widen-only so the by_room index could become the authoritative read path
 * for a room's links (see model/issues.issueLinksForRoom); rows written
 * before it are invisible to that path until tagged. Orphaned links (parent
 * issue gone) are left for the orphan sweep.
 */
export const backfillIssueLinksRoomId = internalMutation({
  args: {},
  handler: async (ctx) => {
    const links = await ctx.db.query("issueLinks").collect();
    const outcomes = await Promise.all(
      links.map(async (link) => {
        if (link.roomId !== undefined) return "already-tagged";
        const issue = await ctx.db.get(link.issueId);
        if (!issue) return "orphaned";
        await ctx.db.patch(link._id, { roomId: issue.roomId });
        return "tagged";
      })
    );
    return {
      total: links.length,
      tagged: outcomes.filter((o) => o === "tagged").length,
      orphaned: outcomes.filter((o) => o === "orphaned").length,
    };
  },
});

/**
 * The tables the retired team retro wrote. They are no longer in the schema,
 * so they are reached untyped; nothing else reads them.
 */
const LEGACY_RETRO_TABLES = [
  "retroCards",
  "retroClusters",
  "retroVotes",
  "retroActions",
  "retros",
  "teamMemberships",
  "teams",
] as const;

type LegacyRow = { _id: GenericId<string>; reminderJobId?: Id<"_scheduled_functions"> };
type LegacyDb = {
  query: (table: string) => { take: (n: number) => Promise<LegacyRow[]> };
  delete: (id: GenericId<string>) => Promise<void>;
};

const PURGE_BATCH = 200;

/**
 * Clears out the retired team retro (the old boards, Teams and their email
 * reminders) so the whiteboard retro starts clean. Deletes every legacy retro
 * room through the room cascade, empties the legacy tables batch by batch
 * (cancelling any reminder still scheduled), and clears the legacy
 * `teamId` / `joinPolicy` room fields. Reschedules itself until nothing is
 * left; safe to re-run. Once it has run on a deployment, those fields and
 * tables can be dropped from the schema.
 *
 *   npx convex run migrations:purgeLegacyRetros        (add --prod for production)
 */
export const purgeLegacyRetros = internalMutation({
  args: {},
  handler: async (ctx) => {
    const db = ctx.db as unknown as LegacyDb;
    let deleted = 0;
    for (const table of LEGACY_RETRO_TABLES) {
      const rows = await db.query(table).take(PURGE_BATCH);
      for (const row of rows) {
        if (row.reminderJobId) {
          const job = await ctx.db.system.get(row.reminderJobId);
          if (job?.state.kind === "pending") await ctx.scheduler.cancel(row.reminderJobId);
        }
        await db.delete(row._id);
      }
      deleted += rows.length;
      if (rows.length === PURGE_BATCH) {
        await ctx.scheduler.runAfter(0, internal.migrations.purgeLegacyRetros, {});
        return { deleted, done: false };
      }
    }

    // A retro room without the new state belongs to the old board.
    const rooms = await ctx.db.query("rooms").collect();
    let roomsScheduled = 0;
    for (const room of rooms) {
      if (room.roomType === "retro" && !room.retro) {
        await ctx.scheduler.runAfter(0, internal.maintenance.deleteRoomAggregateChunk, { roomId: room._id });
        roomsScheduled++;
      } else if (room.teamId !== undefined || room.joinPolicy !== undefined) {
        const { teamId: _team, joinPolicy: _policy, ...rest } = room;
        await ctx.db.replace(room._id, rest);
      }
    }
    return { deleted, roomsScheduled, done: true };
  },
});

/**
 * Clears the retired retro emails' `users.emailOptOut` flag, a page of users
 * per run, rescheduling itself until the table is walked. Once it has run
 * everywhere, the field can be dropped from the schema.
 *
 *   npx convex run migrations:clearLegacyEmailOptOut        (add --prod for production)
 */
export const clearLegacyEmailOptOut = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("users").paginate({ numItems: 500, cursor: args.cursor ?? null });
    let cleared = 0;
    for (const user of page.page) {
      if (user.emailOptOut === undefined) continue;
      const { emailOptOut: _optOut, ...rest } = user;
      await ctx.db.replace(user._id, rest);
      cleared++;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.clearLegacyEmailOptOut, { cursor: page.continueCursor });
    }
    return { cleared, done: page.isDone };
  },
});
