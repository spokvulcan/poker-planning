import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import * as Canvas from "./canvas";
import * as Rooms from "./rooms";
import * as VotingRound from "./votingRound";
import type { MemberRole } from "../permissions";

export interface JoinRoomArgs {
  roomId: Id<"rooms">;
  name: string;
  isSpectator?: boolean;
  authUserId: string;
}

export interface EditUserArgs {
  userId: Id<"users">;
  roomId: Id<"rooms">;
  name?: string;
  isSpectator?: boolean;
}

// Merged user data returned to frontend (user + membership combined)
export interface RoomUserData {
  _id: Id<"users">;
  name: string;
  avatarUrl?: string;
  isSpectator: boolean;
  isBot?: boolean;
  role: MemberRole;
  joinedAt: number;
  membershipId: Id<"roomMemberships">;
}

/**
 * Finds or creates a global user by authUserId
 */
export async function findOrCreateGlobalUser(
  ctx: MutationCtx,
  args: { authUserId: string; name: string }
): Promise<Id<"users">> {
  // Check for existing global user
  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", args.authUserId))
    .first();

  if (existingUser) {
    // Update name if changed
    if (existingUser.name !== args.name) {
      await ctx.db.patch(existingUser._id, { name: args.name });
    }
    return existingUser._id;
  }

  // Create new global user.
  // Don't set accountType here — we can't reliably determine it from a mutation
  // context. The BetterAuth session (isAnonymous) is the authoritative source
  // for the frontend. linkAnonymousToPermanent sets "permanent" on upgrade.
  return await ctx.db.insert("users", {
    authUserId: args.authUserId,
    name: args.name,
    createdAt: Date.now(),
  });
}

/**
 * Gets a global user by authUserId (without room context)
 */
export async function getGlobalUserByAuthUserId(
  ctx: QueryCtx,
  authUserId: string
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
    .first();
}

/**
 * Gets membership for a user in a room
 */
export async function getMembership(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">
): Promise<Doc<"roomMemberships"> | null> {
  return await ctx.db
    .query("roomMemberships")
    .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
    .first();
}

/**
 * Gets membership by authUserId for a specific room
 */
export async function getMembershipByAuthUserId(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  authUserId: string
): Promise<{ user: Doc<"users">; membership: Doc<"roomMemberships"> } | null> {
  // Find global user
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
    .first();

  if (!user) return null;

  // Find membership in this room
  const membership = await getMembership(ctx, roomId, user._id);
  if (!membership) return null;

  return { user, membership };
}

/**
 * Adds a user to a room or returns existing membership if authUserId matches
 */
export async function joinRoom(
  ctx: MutationCtx,
  args: JoinRoomArgs
): Promise<Id<"users">> {
  // Update room activity
  await Rooms.updateRoomActivity(ctx, args.roomId);

  // Find or create global user
  const userId = await findOrCreateGlobalUser(ctx, {
    authUserId: args.authUserId,
    name: args.name,
  });

  // Check if membership already exists for this room
  const existingMembership = await getMembership(ctx, args.roomId, userId);
  if (existingMembership) {
    // If this is the room owner rejoining, ensure their role is set to "owner"
    const room = await ctx.db.get(args.roomId);
    if (room?.ownerId === userId && existingMembership.role !== "owner") {
      await ctx.db.patch(existingMembership._id, { role: "owner" });
    }
    return userId;
  }

  // Determine role: owner if this user is the room's owner, otherwise participant
  const room = await ctx.db.get(args.roomId);
  const role = room?.ownerId === userId ? ("owner" as const) : undefined;

  // Create membership
  await ctx.db.insert("roomMemberships", {
    roomId: args.roomId,
    userId,
    isSpectator: args.isSpectator ?? false,
    joinedAt: Date.now(),
    ...(role ? { role } : {}),
  });

  // Check if this is a canvas room and create player node
  if (room && room.roomType === "canvas") {
    await Canvas.upsertPlayerNode(ctx, { roomId: args.roomId, userId });
  }

  return userId;
}

/**
 * Updates user information (name on global user, isSpectator on membership)
 */
export async function editUser(
  ctx: MutationCtx,
  args: EditUserArgs
): Promise<void> {
  const user = await ctx.db.get(args.userId);
  if (!user) throw new Error("User not found");

  // Get membership for room context
  const membership = await getMembership(ctx, args.roomId, args.userId);
  if (!membership) throw new Error("User not in room");

  // Update room activity
  await Rooms.updateRoomActivity(ctx, args.roomId);

  // Update name on global user if changed
  if (args.name !== undefined) {
    await ctx.db.patch(args.userId, { name: args.name });
  }

  // Handle spectator status transitions. Flip the roster bit first (membership is
  // this module's to write), then hand the round its due: becoming a spectator
  // drops this voter, so the round deletes their votes and re-checks completion —
  // it may now arm the auto-reveal countdown. Un-spectating needs no reconcile:
  // a spectator is voteless (castVote refuses them; this branch dropped any vote
  // on the way in), so un-spectating adds a fresh non-voter that can't silently
  // complete the round, and a latecomer never cancels a running countdown (ADR-0004).
  if (args.isSpectator !== undefined && args.isSpectator !== membership.isSpectator) {
    await ctx.db.patch(membership._id, { isSpectator: args.isSpectator });

    if (args.isSpectator) {
      await VotingRound.dropVoter(ctx, args.roomId, args.userId);
    }
  }
}

/**
 * Removes a user from a room (deletes membership, keeps global user)
 */
export async function leaveRoom(
  ctx: MutationCtx,
  userId: Id<"users">,
  roomId: Id<"rooms">
): Promise<void> {
  const membership = await getMembership(ctx, roomId, userId);
  if (!membership) return;

  // Membership and any canvas player node are this module's to remove. Delete the
  // membership FIRST so the non-spectator roster reflects the departure before the
  // round re-checks completion.
  await ctx.db.delete(membership._id);

  const room = await ctx.db.get(roomId);
  if (room && room.roomType === "canvas") {
    await Canvas.removePlayerNode(ctx, { roomId, userId });
  }

  // Hand off to the round: drop the leaver's votes (the round is the sole writer
  // of the votes table — ADR-0002) and reconcile the auto-reveal countdown, which
  // may now arm if the leaver was the last non-voter. The remove/kick path funnels
  // through here too, so it is covered.
  await VotingRound.dropVoter(ctx, roomId, userId);

  // Update room activity
  await Rooms.updateRoomActivity(ctx, roomId);
}

/**
 * Gets all users in a room (via memberships)
 */
export async function getRoomUsers(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<RoomUserData[]> {
  // Get all memberships for this room
  const memberships = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();

  // Get all users for these memberships
  const users = await Promise.all(
    memberships.map((m) => ctx.db.get(m.userId))
  );

  // Merge user and membership data
  return memberships.map((membership, index) => {
    const user = users[index];
    if (!user) throw new Error("User not found for membership");
    return {
      _id: user._id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isSpectator: membership.isSpectator,
      role: membership.role ?? "participant",
      joinedAt: membership.joinedAt,
      membershipId: membership._id,
    };
  });
}

/**
 * Checks if a user name is already taken in a room
 */
export async function isUserNameTaken(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  name: string
): Promise<boolean> {
  const users = await getRoomUsers(ctx, roomId);
  return users.some((user) => user.name.toLowerCase() === name.toLowerCase());
}

/**
 * Updates a global user's name by authUserId
 */
export async function updateGlobalUserName(
  ctx: MutationCtx,
  authUserId: string,
  name: string
): Promise<void> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
    .first();

  if (!user) {
    throw new Error("User not found");
  }

  await ctx.db.patch(user._id, { name });
}

/**
 * Creates or updates a global user record from auth provider data.
 * Called from databaseHooks when a permanent (non-anonymous) user is created in BetterAuth.
 * Unlike findOrCreateGlobalUser (used at room-join time), this sets
 * email, avatarUrl, and accountType="permanent".
 */
export async function ensureGlobalUserFromAuth(
  ctx: MutationCtx,
  args: {
    authUserId: string;
    name: string;
    email: string;
    avatarUrl?: string;
  }
): Promise<void> {
  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", args.authUserId))
    .first();

  if (existingUser) {
    // User already exists (e.g., created by a race with joinRoom).
    // Patch in permanent account details that findOrCreateGlobalUser doesn't set.
    await ctx.db.patch(existingUser._id, {
      email: args.email,
      accountType: "permanent" as const,
      ...(args.avatarUrl ? { avatarUrl: args.avatarUrl } : {}),
    });
    return;
  }

  await ctx.db.insert("users", {
    authUserId: args.authUserId,
    name: args.name,
    email: args.email,
    avatarUrl: args.avatarUrl,
    accountType: "permanent" as const,
    createdAt: Date.now(),
  });
}

/**
 * Syncs avatar URL from auth provider to the global user record
 */
export async function syncGlobalUserAvatar(
  ctx: MutationCtx,
  authUserId: string,
  avatarUrl: string
): Promise<void> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
    .first();

  if (user && user.avatarUrl !== avatarUrl) {
    await ctx.db.patch(user._id, { avatarUrl });
  }
}

/**
 * Completely deletes a user from the system (on sign out)
 * Removes from all rooms, deletes memberships, votes, canvas nodes, presence, and the user record
 */
export async function deleteUserByAuthUserId(
  ctx: MutationCtx,
  authUserId: string
): Promise<void> {
  // Find global user
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
    .first();

  if (!user) return;

  // Find all memberships for this user
  const memberships = await ctx.db
    .query("roomMemberships")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();

  // Leave each room (cleans up votes, canvas nodes, presence)
  await Promise.all(
    memberships.map((membership) => leaveRoom(ctx, user._id, membership.roomId))
  );

  // Delete individual vote snapshots for this user
  const individualVotes = await ctx.db
    .query("individualVotes")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  await Promise.all(individualVotes.map((iv) => ctx.db.delete(iv._id)));

  // Delete the global user record
  await ctx.db.delete(user._id);
}

/**
 * Links an anonymous user account to a new permanent account.
 * Transfers all memberships, votes, and canvas node ownerships.
 */
export async function linkAnonymousToPermanent(
  ctx: MutationCtx,
  args: {
    oldAuthUserId: string;
    newAuthUserId: string;
    email: string;
    name?: string;
    avatarUrl?: string;
  }
): Promise<void> {
  // Find existing user by old anonymous authUserId
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", args.oldAuthUserId))
    .first();

  if (!user) {
    // No application user found — might be a fresh sign-in without prior room join
    // BetterAuth will create the auth user; our app user gets created on next room join
    return;
  }

  // Check if there's already a user with the new authUserId (shouldn't happen normally)
  const existingPermanent = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", args.newAuthUserId))
    .first();

  if (existingPermanent) {
    // Update the permanent user with account details from the OAuth provider.
    // The permanent user was likely created by the auto-join race condition
    // (before onLinkAccount ran) and is missing email/accountType/avatarUrl.
    await ctx.db.patch(existingPermanent._id, {
      email: args.email,
      accountType: "permanent" as const,
      avatarUrl: args.avatarUrl,
    });

    // Merge: transfer memberships from anonymous user to existing permanent user
    const memberships = await ctx.db
      .query("roomMemberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const membership of memberships) {
      // Check if permanent user already has membership in this room
      const existingMembership = await getMembership(ctx, membership.roomId, existingPermanent._id);
      if (existingMembership) {
        // Already in room — delete the anonymous membership
        await ctx.db.delete(membership._id);
      } else {
        // Transfer membership to permanent user
        await ctx.db.patch(membership._id, { userId: existingPermanent._id });
      }
    }

    // Transfer votes.
    // Sole-writer exception (ADR-0004): this re-points vote *ownership* during a
    // sign-in identity merge — not a round action — so it writes the votes table
    // directly and does NOT reconcile the auto-reveal countdown. Accepted because
    // the merge is a cold sign-in path; a merge that happens to complete a live
    // round won't auto-arm until the next vote or roster change.
    // Rule: keep at most one vote per (room, user). If the permanent user already
    // voted in a room, or is a spectator there (spectators are voteless), drop the
    // anonymous vote; otherwise re-point it to the permanent user.
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const vote of votes) {
      const existingVote = await ctx.db
        .query("votes")
        .withIndex("by_room_user", (q) =>
          q.eq("roomId", vote.roomId).eq("userId", existingPermanent._id)
        )
        .first();

      // Drop the anonymous vote (rather than transfer it) when the permanent
      // user already voted in this room, OR is a spectator there. Spectators are
      // voteless (ADR-0004): re-pointing a vote onto a spectator would recreate
      // the "spectator holds a vote row" state that strands the auto-reveal
      // countdown when that member is later un-spectated.
      const destMembership = await getMembership(
        ctx,
        vote.roomId,
        existingPermanent._id
      );
      if (existingVote || destMembership?.isSpectator) {
        await ctx.db.delete(vote._id);
      } else {
        await ctx.db.patch(vote._id, { userId: existingPermanent._id });
      }
    }

    // Transfer individual vote snapshots
    // Rule: If both users have snapshots for the same issue,
    // keep the permanent user's and delete the anonymous one.
    const anonIndividualVotes = await ctx.db
      .query("individualVotes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const iv of anonIndividualVotes) {
      const existingIv = await ctx.db
        .query("individualVotes")
        .withIndex("by_room_user_issue", (q) =>
          q
            .eq("roomId", iv.roomId)
            .eq("userId", existingPermanent._id)
            .eq("issueId", iv.issueId)
        )
        .first();

      if (existingIv) {
        await ctx.db.delete(iv._id);
      } else {
        await ctx.db.patch(iv._id, { userId: existingPermanent._id });
      }
    }

    // Transfer canvas nodes (ownership & player nodes)
    // Query each room the anonymous user is a member of to find their player nodes
    const playerNodes: Doc<"canvasNodes">[] = [];
    for (const membership of memberships) {
      const node = await ctx.db
        .query("canvasNodes")
        .withIndex("by_room_node", (q) =>
          q.eq("roomId", membership.roomId).eq("nodeId", `player-${user._id}`)
        )
        .first();
      if (node) playerNodes.push(node);
    }

    for (const node of playerNodes) {
      const existingPlayerNode = await ctx.db
        .query("canvasNodes")
        .withIndex("by_room_node", (q) =>
          q.eq("roomId", node.roomId).eq("nodeId", `player-${existingPermanent._id}`)
        )
        .first();

      if (existingPlayerNode) {
        // Permanent user already has a player node in this room
        await ctx.db.delete(node._id);
      } else {
        // Transfer node to permanent user (update both nodeId and data.userId)
        await ctx.db.patch(node._id, {
          nodeId: `player-${existingPermanent._id}`,
          data: { ...node.data, userId: existingPermanent._id },
        });
      }
    }

    // Transfer room ownership from anonymous user to permanent user
    const ownedRooms = await ctx.db
      .query("rooms")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const room of ownedRooms) {
      await ctx.db.patch(room._id, { ownerId: existingPermanent._id });
    }

    // Update lastUpdatedBy on any canvas nodes touched by the anonymous user
    const updatedNodes = await ctx.db
      .query("canvasNodes")
      .withIndex("by_last_updated_by", (q) => q.eq("lastUpdatedBy", user._id))
      .collect();

    for (const node of updatedNodes) {
      await ctx.db.patch(node._id, { lastUpdatedBy: existingPermanent._id });
    }

    // Delete the old anonymous user record
    await ctx.db.delete(user._id);
    return;
  }

  // Simple case: update the user record to point to new authUserId
  await ctx.db.patch(user._id, {
    authUserId: args.newAuthUserId,
    email: args.email,
    avatarUrl: args.avatarUrl,
    accountType: "permanent",
    // Always preserve the user's chosen display name over the OAuth provider name.
    // Anonymous users always have a name (set on room join), so this only applies
    // if the user record somehow has an empty name.
    ...(args.name && !user.name ? { name: args.name } : {}),
  });
}
