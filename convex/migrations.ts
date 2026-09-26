/**
 * One-shot data migrations, run manually with `npx convex run migrations:<name>`
 * (add `--prod` for the production deployment). Each is idempotent and safe to
 * re-run once any jobs it scheduled have finished.
 */

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import * as Integrations from "./model/integrations";

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
        const issue = await ctx.db.get("issues", link.issueId);
        if (!issue) return "orphaned";
        await ctx.db.patch("issueLinks", link._id, { roomId: issue.roomId });
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
 * Disconnects integration connections whose user row is gone. Account
 * deletion and the guest-into-permanent merge used to leave them behind,
 * still holding encrypted OAuth tokens the refresh cron kept refreshing, with
 * their room mappings and remote webhooks live. Each goes through the
 * disconnect cascade: its mappings are deleted, and a connection with live
 * webhooks stays until the provider's finalizeDisconnect job has deregistered
 * them. A room mapped through an orphan stops syncing until someone there
 * reconnects and re-maps. `dryRun` only counts; use it to check a finished
 * run, because a real re-run before those jobs finish deletes their rows
 * early and leaves the webhooks to expire remotely.
 */
export const disconnectOrphanedConnections = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const connections = await ctx.db.query("integrationConnections").collect();
    const orphans = (
      await Promise.all(
        connections.map(async (connection) =>
          (await ctx.db.get("users", connection.userId)) ? [] : [connection]
        )
      )
    ).flat();

    let mappings = 0;
    for (const orphan of orphans) {
      const orphanMappings = await ctx.db
        .query("integrationMappings")
        .withIndex("by_connection", (q) => q.eq("connectionId", orphan._id))
        .collect();
      mappings += orphanMappings.length;
      if (!args.dryRun) {
        await Integrations.disconnectConnection(ctx, orphan._id);
      }
    }

    return { total: connections.length, orphaned: orphans.length, mappings };
  },
});
