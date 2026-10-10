import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import * as Users from "./model/users";
import * as AccountLifecycle from "./model/accountLifecycle";
import { getMembership } from "./model/memberships";
import { findUser, getCaller, requireCaller } from "./model/caller";
import {
  requireAuthAs,
  requireActingUser,
  requireCan,
} from "./model/auth";

// Get global user for the currently authenticated user
export const getGlobalUser = query({
  args: {},
  handler: async (ctx) => {
    return (await getCaller(ctx))?.user ?? null;
  },
});

// Get membership for the current user in a specific room (for auto-restore)
export const getMyMembership = query({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const user = (await getCaller(ctx))?.user;
    if (!user) return null;

    const membership = await getMembership(ctx, args.roomId, user._id);
    if (!membership) return null;

    // Return merged user + membership data for frontend
    return {
      _id: user._id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isSpectator: membership.isSpectator,
      role: membership.role ?? ("participant" as const),
      joinedAt: membership.joinedAt,
      membershipId: membership._id,
    };
  },
});

export const join = mutation({
  args: {
    roomId: v.id("rooms"),
    name: v.string(),
    isSpectator: v.optional(v.boolean()),
    authUserId: v.string(), // The caller's own id; older browsers still send it
  },
  handler: async (ctx, args) => {
    await requireAuthAs(ctx, args.authUserId);

    return await Users.joinRoom(ctx, {
      roomId: args.roomId,
      name: args.name,
      isSpectator: args.isSpectator,
      authUserId: args.authUserId,
    });
  },
});

export const edit = mutation({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
    name: v.optional(v.string()),
    isSpectator: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Authenticated, in-room, and acting as this userId — the one guard.
    await requireActingUser(ctx, args.roomId, args.userId, "Cannot edit another user");

    await Users.editUser(ctx, {
      userId: args.userId,
      roomId: args.roomId,
      name: args.name,
      isSpectator: args.isSpectator,
    });
  },
});

export const leave = mutation({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    // Authenticated, in-room, and acting as this userId — the one guard.
    await requireActingUser(ctx, args.roomId, args.userId, "Cannot remove another user");

    await Users.leaveRoom(ctx, args.userId, args.roomId);
  },
});

// Remove a user from a room (role-based: owner→anyone, facilitator→participants only)
export const remove = mutation({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    await requireCan(
      ctx,
      args.roomId,
      { kind: "relationship", verb: "remove" },
      args.userId
    );

    await Users.leaveRoom(ctx, args.userId, args.roomId);
  },
});

// Edit global user (name only, no room context required)
export const editGlobalUser = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    await Users.updateGlobalUserName(ctx, user, args.name);
  },
});

// Delete user completely (called on sign out)
export const deleteUser = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireCaller(ctx);
    if (user) await AccountLifecycle.deleteAccount(ctx, user);
  },
});

// Create/update global user from auth provider data (called from databaseHooks on permanent account creation)
export const ensureGlobalUserFromAuth = internalMutation({
  args: {
    authUserId: v.string(),
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await Users.ensureGlobalUserFromAuth(ctx, args);
  },
});

// Sync avatar URL from auth provider to global user (called from databaseHooks)
export const syncAvatarFromAuth = internalMutation({
  args: {
    authUserId: v.string(),
    avatarUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await Users.syncGlobalUserAvatar(ctx, args.authUserId, args.avatarUrl);
  },
});

// Ensure the caller has a global user, making one with `name` when they have
// none. An existing row keeps its name: the session bootstrap calls this on
// every create, with a fresh guest name each time.
export const ensureGlobalUser = mutation({
  args: {
    authUserId: v.string(), // The caller's own id; older browsers still send it
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAuthAs(ctx, args.authUserId);

    if (user) return;
    await Users.findOrCreateGlobalUser(ctx, {
      authUserId: args.authUserId,
      name: args.name,
    });
  },
});

export const linkAnonymousAccount = internalMutation({
  args: {
    oldAuthUserId: v.string(),
    newAuthUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await Users.linkAnonymousToPermanent(ctx, args);
  },
});

// The users row of the person signed in as `authUserId`: how an action, which
// has no database of its own, finds its caller (model/caller.ts).
export const userByAuthId = internalQuery({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => {
    return await findUser(ctx, args.authUserId);
  },
});
