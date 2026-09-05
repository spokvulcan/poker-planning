import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import * as Teams from "./model/teams";
import * as RetroActions from "./model/retroActions";
import { retroDefaultsValidator } from "./schema";
import { getOptionalAuthUser, requireAuthUser, requireTeamRole } from "./model/auth";

/** Create a Team; the caller becomes its admin (permanent accounts only). */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireAuthUser(ctx);
    return await Teams.createTeam(ctx, { user, name: args.name });
  },
});

/**
 * The team an invite link points at — name only, unguarded: the link itself
 * is the credential, and the join page needs the name for "Sign in to join
 * {team}" before the visitor has an account.
 */
export const getByInviteToken = query({
  args: { inviteToken: v.string() },
  handler: async (ctx, args) => {
    const team = await Teams.getTeamByInviteToken(ctx, args.inviteToken);
    return team ? { _id: team._id, name: team.name } : null;
  },
});

/** Consume an invite link: become a member (permanent accounts only). */
export const joinByInvite = mutation({
  args: { inviteToken: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireAuthUser(ctx);
    return await Teams.joinByInvite(ctx, { user, inviteToken: args.inviteToken });
  },
});

/** Rotate the invite link (admin). */
export const rotateInvite = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireTeamRole(ctx, args.teamId, "admin");
    await Teams.rotateInvite(ctx, args.teamId);
  },
});

/** Rename the team (admin). */
export const rename = mutation({
  args: { teamId: v.id("teams"), name: v.string() },
  handler: async (ctx, args) => {
    await requireTeamRole(ctx, args.teamId, "admin");
    await Teams.renameTeam(ctx, args.teamId, args.name);
  },
});

/** Replace the retro-defaults bundle (admin). Written by value, whole. */
export const updateRetroDefaults = mutation({
  args: { teamId: v.id("teams"), retroDefaults: retroDefaultsValidator },
  handler: async (ctx, args) => {
    await requireTeamRole(ctx, args.teamId, "admin");
    await Teams.updateRetroDefaults(ctx, args.teamId, args.retroDefaults);
  },
});

/** Make a member an admin (admin). */
export const promote = mutation({
  args: { teamId: v.id("teams"), targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    await requireTeamRole(ctx, args.teamId, "admin");
    await Teams.promote(ctx, args.teamId, args.targetUserId);
  },
});

/** Make an admin a member (admin); the last admin is refused. */
export const demote = mutation({
  args: { teamId: v.id("teams"), targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    await requireTeamRole(ctx, args.teamId, "admin");
    await Teams.demote(ctx, args.teamId, args.targetUserId);
  },
});

/** Remove someone else's membership (admin). Deletes the row and nothing else. */
export const removeMember = mutation({
  args: { teamId: v.id("teams"), targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    const { user } = await requireTeamRole(ctx, args.teamId, "admin");
    await Teams.removeMember(ctx, {
      teamId: args.teamId,
      actorUserId: user._id,
      targetUserId: args.targetUserId,
    });
  },
});

/** Leave the team (member); the last admin is refused. */
export const leave = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const { membership } = await requireTeamRole(ctx, args.teamId, "member");
    await Teams.leave(ctx, membership);
  },
});

/**
 * Delete the team (admin): every room it owns goes through the room cascade,
 * memberships drain in batches, the team row goes last.
 */
export const remove = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireTeamRole(ctx, args.teamId, "admin");
    const { roomsScheduled } = await Teams.deleteTeam(ctx, args.teamId);
    return { roomsScheduled };
  },
});

/** The team page (members only). */
export const get = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const { team, membership } = await requireTeamRole(ctx, args.teamId, "member");
    return await Teams.getTeamPage(ctx, team, membership);
  },
});

/** The caller's Teams; empty for anyone without a permanent account. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) return [];
    return await Teams.listTeamsForUser(ctx, user._id);
  },
});

/** The team page's open action items across its retros, oldest first (members only, spec §5). */
export const openActions = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const { user } = await requireTeamRole(ctx, args.teamId, "member");
    return await RetroActions.teamOpenActions(ctx, user, args.teamId);
  },
});

/** The team page's count line (spec §17): action counts by status across the Team and its retro count (members only). */
export const facts = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireTeamRole(ctx, args.teamId, "member");
    return await Teams.teamFacts(ctx, args.teamId);
  },
});
