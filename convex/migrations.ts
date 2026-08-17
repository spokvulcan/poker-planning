/**
 * One-shot data migrations, run manually with `npx convex run migrations:<name>`
 * (add `--prod` for the production deployment). Each is idempotent and safe to
 * re-run.
 */

import { internalMutation } from "./_generated/server";

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
    let tagged = 0;
    let orphaned = 0;
    for (const link of links) {
      if (link.roomId !== undefined) continue;
      const issue = await ctx.db.get(link.issueId);
      if (!issue) {
        orphaned++;
        continue;
      }
      await ctx.db.patch(link._id, { roomId: issue.roomId });
      tagged++;
    }
    return { total: links.length, tagged, orphaned };
  },
});
