/**
 * One-shot data migrations, run manually with `npx convex run migrations:<name>`
 * (add `--prod` for the production deployment). Each is idempotent and safe to
 * re-run.
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

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
 * How many rooms one backfill invocation stamps before handing off to a
 * scheduled continuation. Keeps each transaction small on a large table.
 */
const RETAINED_BACKFILL_BATCH = 100;

/**
 * Stamps `rooms.retained: false` on every row written before the field
 * existed (ADR-0019, widen release #284). Reads the `undefined` range of
 * `by_retention_activity`; patched rows leave that range, so the query
 * self-terminates and no cursor is carried. While a batch comes back full
 * the mutation reschedules itself with `runAfter(0)`. Idempotent and safe
 * to re-run. `dryRun` reads one batch without writing: `found` is exact
 * when it is below `batchSize` (0 means the backfill is complete), and
 * "at least that many" otherwise.
 *
 * Must run to completion in prod before the narrow release (#285) makes the
 * field required — the Convex push validates data at rest and would abort.
 *
 *   npx convex run migrations:backfillRoomsRetained '{"dryRun": true}' --prod
 *   npx convex run migrations:backfillRoomsRetained --prod
 */
export const backfillRoomsRetained = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? RETAINED_BACKFILL_BATCH;
    const batch = await ctx.db
      .query("rooms")
      .withIndex("by_retention_activity", (q) => q.eq("retained", undefined))
      .take(batchSize);

    const found = batch.length;
    if (args.dryRun) {
      return { found, stamped: 0, rescheduled: false };
    }

    await Promise.all(batch.map((room) => ctx.db.patch(room._id, { retained: false })));

    const rescheduled = found === batchSize;
    if (rescheduled) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillRoomsRetained, {
        batchSize,
      });
    }
    return { found, stamped: found, rescheduled };
  },
});
