import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * One-off cleanup of the legacy server-seeded demo room.
 *
 * The Demo simulation is now a fully client-side illustration (ADR-0003): there
 * is no `rooms` row, no bot membership, and no persisted vote. This purges the
 * production seed and everything that hangs off it.
 *
 * MIGRATION SHAPE — this is the "migrate" step of a widen -> migrate -> narrow
 * schema change (per the convex-migration-helper skill). `rooms.isDemoRoom` and
 * `roomMemberships.isBot` stay `v.optional()` (widened — they already were)
 * through the deploy that ships this function; only AFTER it has run in prod
 * does a follow-up deploy drop those fields and the model/cleanup.ts exclusion
 * (narrow). Run it BEFORE that schema-drop deploy — otherwise the push fails
 * validating the still-present demo documents.
 *
 * Single-transaction `.collect()` is safe here on purpose: the data is one room
 * and ~6 bots (the "small table shortcut"), far below Convex's limits — no need
 * for the @convex-dev/migrations component's batching.
 *
 * Identifies the room by NAME (not the to-be-dropped `isDemoRoom` field) so it
 * runs against either schema. Preview, then run for real:
 *   npx convex run cleanupDemo:purgeDemoRoom '{"dryRun": true}'
 *   npx convex run cleanupDemo:purgeDemoRoom
 * Re-running with {"dryRun": true} afterwards should report all-zero counts —
 * that is the migration's completeness check.
 */
const DEMO_ROOM_NAME = "Planning Poker Demo";

export const purgeDemoRoom = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun = false }) => {
    const rooms = await ctx.db
      .query("rooms")
      // One-off by-name lookup (no name index, and efficiency is irrelevant for
      // a single manual run).
      // eslint-disable-next-line @convex-dev/no-filter-in-query
      .filter((q) => q.eq(q.field("name"), DEMO_ROOM_NAME))
      .collect();

    // In dryRun the counts are "would delete"; otherwise "deleted". The returned
    // `dryRun` flag tells the caller which.
    const counts = {
      rooms: 0,
      botUsers: 0,
      memberships: 0,
      votes: 0,
      individualVotes: 0,
      votingTimestamps: 0,
      canvasNodes: 0,
      issues: 0,
      scheduledReveals: 0,
    };

    for (const room of rooms) {
      const [memberships, votes, individualVotes, votingTimestamps, canvasNodes, issues] =
        await Promise.all([
          ctx.db
            .query("roomMemberships")
            .withIndex("by_room", (q) => q.eq("roomId", room._id))
            .collect(),
          ctx.db
            .query("votes")
            .withIndex("by_room", (q) => q.eq("roomId", room._id))
            .collect(),
          ctx.db
            .query("individualVotes")
            .withIndex("by_room", (q) => q.eq("roomId", room._id))
            .collect(),
          ctx.db
            .query("votingTimestamps")
            .withIndex("by_room", (q) => q.eq("roomId", room._id))
            .collect(),
          ctx.db
            .query("canvasNodes")
            .withIndex("by_room", (q) => q.eq("roomId", room._id))
            .collect(),
          ctx.db
            .query("issues")
            .withIndex("by_room", (q) => q.eq("roomId", room._id))
            .collect(),
        ]);

      // The bots exist only for this room (authUserId "bot-*"). Guard on the
      // prefix so a real account is never removed even if it shares the room.
      const botUserIds: Id<"users">[] = [];
      for (const membership of memberships) {
        const user = await ctx.db.get(membership.userId);
        if (user?.authUserId.startsWith("bot-")) botUserIds.push(user._id);
      }

      counts.rooms++;
      counts.botUsers += botUserIds.length;
      counts.memberships += memberships.length;
      counts.votes += votes.length;
      counts.individualVotes += individualVotes.length;
      counts.votingTimestamps += votingTimestamps.length;
      counts.canvasNodes += canvasNodes.length;
      counts.issues += issues.length;
      if (room.autoRevealScheduledId) counts.scheduledReveals++;

      if (dryRun) continue; // count only — touch nothing

      // Cancel any live scheduled auto-reveal FIRST — its countdown is about to
      // disappear with the room, and a stale job must not fire.
      if (room.autoRevealScheduledId) {
        try {
          await ctx.scheduler.cancel(room.autoRevealScheduledId);
        } catch {
          // Already executed or cancelled — fine.
        }
      }

      await Promise.all([
        ...botUserIds.map((id) => ctx.db.delete(id)),
        ...memberships.map((membership) => ctx.db.delete(membership._id)),
        ...votes.map((vote) => ctx.db.delete(vote._id)),
        ...individualVotes.map((iv) => ctx.db.delete(iv._id)),
        ...votingTimestamps.map((ts) => ctx.db.delete(ts._id)),
        ...canvasNodes.map((node) => ctx.db.delete(node._id)),
        ...issues.map((issue) => ctx.db.delete(issue._id)),
      ]);

      await ctx.db.delete(room._id);
    }

    return { dryRun, ...counts };
  },
});
