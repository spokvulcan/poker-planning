/**
 * One-shot data migrations, run manually with `npx convex run migrations:<name>`
 * (add `--prod` for the production deployment). Each is idempotent and safe to
 * re-run once any jobs it scheduled have finished.
 */

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
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

/** How many rooms one step of `backfillOwnerRoles` checks. */
const OWNER_ROLE_BACKFILL_BATCH = 200;

/**
 * Gives a room's owner the owner role where they are in the room under
 * another one. Merging a guest into a permanent account that had already
 * joined the room could leave it that way (see
 * model/users.linkAnonymousToPermanent): the owner counts as present, so no
 * lockdown shows, yet owner-only actions are refused. An owner-role
 * membership exists iff the owner is present (ADR-0001), so a room whose
 * owner has no membership is in lockdown and is left alone; no membership
 * is ever added.
 *
 * Pages through every room, rescheduling itself until done, so no step
 * outgrows a transaction. Each step returns the running totals, and the
 * last one also logs them.
 */
export const backfillOwnerRoles = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    roomsChecked: v.optional(v.number()),
    membershipsRepaired: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ roomsChecked: number; membershipsRepaired: number; done: boolean }> => {
    const batchSize = args.batchSize ?? OWNER_ROLE_BACKFILL_BATCH;
    const { page, isDone, continueCursor } = await ctx.db
      .query("rooms")
      .paginate({ numItems: batchSize, cursor: args.cursor ?? null });

    const outcomes = await Promise.all(
      page.map(async (room) => {
        const ownerId = room.ownerId;
        if (!ownerId) return "no-owner";
        const membership = await ctx.db
          .query("roomMemberships")
          .withIndex("by_room_user", (q) => q.eq("roomId", room._id).eq("userId", ownerId))
          .first();
        if (!membership) return "lockdown";
        if (membership.role === "owner") return "owner";
        await ctx.db.patch("roomMemberships", membership._id, { role: "owner" });
        return "repaired";
      })
    );

    const totals = {
      roomsChecked: (args.roomsChecked ?? 0) + page.length,
      membershipsRepaired:
        (args.membershipsRepaired ?? 0) + outcomes.filter((o) => o === "repaired").length,
    };
    if (isDone) {
      console.log("Owner role backfill complete:", totals);
    } else {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillOwnerRoles, {
        cursor: continueCursor,
        batchSize,
        ...totals,
      });
    }
    return { ...totals, done: isDone };
  },
});
