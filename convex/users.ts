import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import * as Users from "./model/users";
import * as AccountLifecycle from "./model/accountLifecycle";
import * as Memberships from "./model/memberships";
import { findUser, getCaller, requireCaller } from "./model/caller";
import { requireRoomWrite } from "./model/auth";

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

    const membership = await Memberships.getMembership(ctx, args.roomId, user._id);
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
    authUserId: v.optional(v.string()), // Ignored: older browsers still send the caller's own id
  },
  handler: async (ctx, args) => {
    return await Users.joinRoom(ctx, {
      roomId: args.roomId,
      name: args.name,
      isSpectator: args.isSpectator,
    });
  },
});

export const edit = mutation({
  args: {
    userId: v.optional(v.id("users")), // Ignored: the caller's own id, which old browsers still send
    roomId: v.id("rooms"),
    name: v.optional(v.string()),
    isSpectator: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { room, membership } = await requireRoomWrite(ctx, args.roomId);
    await Users.editUser(ctx, room, membership, { name: args.name, isSpectator: args.isSpectator });
  },
});

export const leave = mutation({
  args: {
    userId: v.optional(v.id("users")), // Ignored: the caller's own id, which old browsers still send
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const { room, membership } = await requireRoomWrite(ctx, args.roomId);
    await Memberships.leave(ctx, room, membership);
  },
});

// Remove a user from a room (role-based: owner→anyone, facilitator→participants only)
export const remove = mutation({
  args: {
    userId: v.id("users"), // The member taken out
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const { room, target } = await requireRoomWrite(
      ctx,
      args.roomId,
      { kind: "relationship", verb: "remove" },
      args.userId
    );
    await Memberships.leave(ctx, room, target!);
  },
});

// Edit global user (name only, no room context required): the caller's row
// takes the name, made with it when they have none yet
export const editGlobalUser = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await Users.findOrMakeUser(ctx, args.name);
  },
});

// Delete account: deletes the caller's account, whatever its kind (the
// Account tab). Older browsers also call it to sign a guest out.
export const deleteUser = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireCaller(ctx);
    if (user) await AccountLifecycle.deleteAccount(ctx, user);
  },
});

// Sign out: deletes the caller's account only when they are a guest; a
// permanent account is kept. With nobody signed in there is nothing to
// delete, and the browser, which calls it before clearing its session, still
// clears it.
export const signOut = mutation({
  args: {},
  handler: async (ctx) => {
    const caller = await getCaller(ctx);
    if (caller) await AccountLifecycle.signOut(ctx, caller);
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

// Older browsers' session bootstrap calls this before every create, to make
// sure the caller has a users row. Creating a room now makes the row itself,
// so it does no more than that: both arguments (the caller's own id, a guest
// name made up in the browser) are accepted and ignored until browsers on the
// old code are gone.
export const ensureGlobalUser = mutation({
  args: {
    authUserId: v.string(),
    name: v.string(),
  },
  handler: async (ctx) => {
    await Users.findOrMakeUser(ctx);
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
