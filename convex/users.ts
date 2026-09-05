import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import * as Users from "./model/users";
import {
  requireAuth,
  requireActingUser,
  requireCan,
  getOptionalAuthUser,
} from "./model/auth";

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Name is required");
  }
  if (trimmed.length > 50) {
    throw new Error("Name must be 50 characters or less");
  }
  return trimmed;
}

// Get global user for the currently authenticated user
export const getGlobalUser = query({
  args: {},
  handler: async (ctx) => {
    return await getOptionalAuthUser(ctx);
  },
});

// Get membership for the current user in a specific room (for auto-restore)
export const getMyMembership = query({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) return null;

    const result = await Users.getMembershipByAuthUserId(
      ctx,
      args.roomId,
      user.authUserId
    );
    if (!result) return null;

    // Return merged user + membership data for frontend
    return {
      _id: result.user._id,
      name: result.user.name,
      avatarUrl: result.user.avatarUrl,
      isSpectator: result.membership.isSpectator,
      role: result.membership.role ?? ("participant" as const),
      joinedAt: result.membership.joinedAt,
      membershipId: result.membership._id,
    };
  },
});

export const join = mutation({
  args: {
    roomId: v.id("rooms"),
    name: v.string(),
    isSpectator: v.optional(v.boolean()),
    authUserId: v.string(), // Kept for post-sign-in race condition
  },
  handler: async (ctx, args) => {
    // Verify the caller owns this authUserId. When the session token hasn't
    // propagated to Convex yet (post-sign-in race), an unauthenticated caller
    // may only create a brand-new user record or rejoin a room they already
    // belong to — anything else would let someone rename another user's
    // account or forge a membership in their name.
    const identity = await ctx.auth.getUserIdentity();
    let allowRename = true;
    if (identity) {
      if (identity.subject !== args.authUserId) {
        throw new Error("Auth identity mismatch");
      }
    } else {
      allowRename = false;
      const existingUser = await Users.getGlobalUserByAuthUserId(
        ctx,
        args.authUserId
      );
      if (existingUser) {
        const membership = await Users.getMembership(
          ctx,
          args.roomId,
          existingUser._id
        );
        if (!membership) {
          throw new Error("Authentication required");
        }
      }
    }

    return await Users.joinRoom(ctx, {
      roomId: args.roomId,
      name: validateName(args.name),
      isSpectator: args.isSpectator,
      authUserId: args.authUserId,
      allowRename,
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
      name: args.name !== undefined ? validateName(args.name) : undefined,
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
    const identity = await requireAuth(ctx);
    await Users.updateGlobalUserName(
      ctx,
      identity.subject,
      validateName(args.name)
    );
  },
});

/** The Settings toggle "Email me about retros and action items" (spec §16.4). */
export const setEmailOptOut = mutation({
  args: { optOut: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await Users.getGlobalUserByAuthUserId(ctx, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }
    await Users.setEmailOptOut(ctx, user._id, args.optOut);
  },
});

// Delete user completely (called on sign out)
export const deleteUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    await Users.deleteUserByAuthUserId(ctx, identity.subject);
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

// Ensure a global user exists (for guest sign-in from auth page)
export const ensureGlobalUser = mutation({
  args: {
    authUserId: v.string(), // Kept for post-sign-in race condition
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify the caller owns this authUserId. When the session token hasn't
    // propagated to Convex yet (post-sign-in race), an unauthenticated caller
    // may only create a brand-new user record — never rename an existing one.
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      if (identity.subject !== args.authUserId) {
        throw new Error("Auth identity mismatch");
      }
    } else {
      const existingUser = await Users.getGlobalUserByAuthUserId(
        ctx,
        args.authUserId
      );
      if (existingUser) {
        // Record already exists and there's no identity to prove ownership:
        // no-op rather than apply an unverified name change.
        return;
      }
    }

    await Users.findOrCreateGlobalUser(ctx, {
      authUserId: args.authUserId,
      name: validateName(args.name),
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
