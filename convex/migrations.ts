/**
 * One-shot data migrations, run manually with `npx convex run migrations:<name>`
 * (add `--prod` for the production deployment). Each is idempotent and safe to
 * re-run once any jobs it scheduled have finished.
 */

import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import * as AccountLifecycle from "./model/accountLifecycle";
import { findUser } from "./model/caller";
import * as Integrations from "./model/integrations";

/**
 * Backfills `issueLinks.roomId` from the parent issue. The field was added
 * widen-only so the by_room index could become the authoritative read path
 * for a room's links (see model/issues.issueLinksForRoom); rows written
 * before it are invisible to that path until tagged. Orphaned links (parent
 * issue gone) are left for the sweep, which drops them.
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
 * model/accountLifecycle.linkAccount): the owner counts as present, so no
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

/** How many canvas nodes one step of `clearTimerRunners` checks. */
const TIMER_RUNNER_BATCH = 500;

/**
 * Clears who last ran each timer from its saved state. Timers stopped saving
 * it (the node's own `lastUpdatedBy` records whoever last touched it), and an
 * id left there could outlive the account it names: letting go of a person
 * finds a node by that field alone (model/canvas.ts, ADR-0030).
 *
 * Pages through every canvas node, rescheduling itself until done, so no step
 * outgrows a transaction. Each step returns the running totals, and the last
 * one also logs them.
 */
export const clearTimerRunners = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    nodesChecked: v.optional(v.number()),
    timersCleared: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ nodesChecked: number; timersCleared: number; done: boolean }> => {
    const batchSize = args.batchSize ?? TIMER_RUNNER_BATCH;
    const { page, isDone, continueCursor } = await ctx.db
      .query("canvasNodes")
      .paginate({ numItems: batchSize, cursor: args.cursor ?? null });

    const timers = page.filter((node) => node.type === "timer" && node.data && "lastUpdatedBy" in node.data);
    await Promise.all(
      timers.map((node) => {
        const { lastUpdatedBy: _, ...data } = node.data;
        return ctx.db.patch("canvasNodes", node._id, { data });
      })
    );

    const totals = {
      nodesChecked: (args.nodesChecked ?? 0) + page.length,
      timersCleared: (args.timersCleared ?? 0) + timers.length,
    };
    if (isDone) {
      console.log("Timer runner cleanup complete:", totals);
    } else {
      await ctx.scheduler.runAfter(0, internal.migrations.clearTimerRunners, {
        cursor: continueCursor,
        batchSize,
        ...totals,
      });
    }
    return { ...totals, done: isDone };
  },
});

/**
 * How many BetterAuth users one step of `deleteLeftoverSignIns` checks. Each
 * leftover costs up to four calls into BetterAuth's component.
 */
const LEFTOVER_SIGN_IN_BATCH = 25;

/**
 * How long a new sign-in is spared: BetterAuth makes its user before the
 * user's session, and the create hook makes the users row after both.
 */
const LEFTOVER_SIGN_IN_GRACE_MS = 24 * 60 * 60 * 1000;

/** A user as BetterAuth's table holds it: its id is a users row's `authUserId`. */
interface BetterAuthUser {
  _id: string;
  isAnonymous?: boolean | null;
  createdAt: number;
}

/**
 * Deletes the BetterAuth sign-ins that accounts' endings left behind before
 * a deleted account took its sign-in with it (ADR-0033): a BetterAuth user
 * with no users row, either permanent, which Delete account left with its
 * email, name, image, accounts and every session, or a guest's with no live
 * session, which a guest's sign-out left once BetterAuth ended the session.
 * Each goes the way Delete account takes one now
 * (model/accountLifecycle.ts `deleteSignIn`).
 *
 * Spared: a sign-in made since `createdBefore` (a day before the run starts
 * by default), whose users row may still be on its way, and a guest's with a
 * live session, who continued as a guest and has yet to make a room write. A
 * permanent account that came back after deleting itself and hasn't made a
 * room write since is signed out: AgileKit holds nothing of it, and signing
 * in again makes a new account.
 *
 * Pages through BetterAuth's users, rescheduling itself until done, so no
 * step outgrows a transaction. Each step returns the running totals, and the
 * last one also logs them. `dryRun` only counts.
 */
export const deleteLeftoverSignIns = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    createdBefore: v.optional(v.number()),
    signInsChecked: v.optional(v.number()),
    permanentLeftovers: v.optional(v.number()),
    guestLeftovers: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ signInsChecked: number; permanentLeftovers: number; guestLeftovers: number; done: boolean }> => {
    const batchSize = args.batchSize ?? LEFTOVER_SIGN_IN_BATCH;
    const createdBefore = args.createdBefore ?? Date.now() - LEFTOVER_SIGN_IN_GRACE_MS;
    const { page, isDone, continueCursor }: { page: BetterAuthUser[]; isDone: boolean; continueCursor: string } =
      await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "user",
        paginationOpts: { numItems: batchSize, cursor: args.cursor ?? null },
      });

    let permanent = 0;
    let guests = 0;
    for (const signIn of page) {
      const leftover = await leftoverKind(ctx, signIn, createdBefore);
      if (!leftover) continue;
      if (leftover === "permanent") permanent++;
      else guests++;
      if (!args.dryRun) await AccountLifecycle.deleteSignIn(ctx, signIn._id);
    }

    const totals = {
      signInsChecked: (args.signInsChecked ?? 0) + page.length,
      permanentLeftovers: (args.permanentLeftovers ?? 0) + permanent,
      guestLeftovers: (args.guestLeftovers ?? 0) + guests,
    };
    if (isDone) {
      console.log(`Leftover sign-in cleanup complete${args.dryRun ? " (dry run)" : ""}:`, totals);
    } else {
      await ctx.scheduler.runAfter(0, internal.migrations.deleteLeftoverSignIns, {
        cursor: continueCursor,
        batchSize,
        dryRun: args.dryRun,
        createdBefore,
        ...totals,
      });
    }
    return { ...totals, done: isDone };
  },
});

/** Sessions read to tell whether a guest's sign-in is still live; a guest has one per browser. */
const GUEST_SESSIONS_READ = 20;

/** What kind of sign-in left behind `signIn` is, or null when it isn't one. */
async function leftoverKind(
  ctx: MutationCtx,
  signIn: BetterAuthUser,
  createdBefore: number
): Promise<"permanent" | "guest" | null> {
  if (signIn.createdAt >= createdBefore) return null;
  if (await findUser(ctx, signIn._id)) return null;
  if (signIn.isAnonymous !== true) return "permanent";
  const sessions: { page: { expiresAt: number }[]; isDone: boolean } = await ctx.runQuery(
    components.betterAuth.adapter.findMany,
    {
      model: "session",
      where: [{ field: "userId", value: signIn._id }],
      paginationOpts: { numItems: GUEST_SESSIONS_READ, cursor: null },
    }
  );
  // More sessions than a guest has is no leftover to guess about.
  const live = !sessions.isDone || sessions.page.some((session) => session.expiresAt > Date.now());
  return live ? null : "guest";
}
