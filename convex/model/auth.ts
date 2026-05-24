import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import {
  PermissionCategory,
  Action,
  resolve,
  requiresOwnerLevel,
  getEffectivePermissions,
  getEffectiveRole,
} from "../permissions";
import { isRoomOwnerAbsent } from "./permissions";

/**
 * Auth identity returned by ctx.auth.getUserIdentity().
 * identity.subject is the BetterAuth user ID (authUserId).
 */
interface AuthIdentity {
  subject: string;
  [key: string]: unknown;
}

/**
 * Requires authentication. Throws if the user is not authenticated.
 * Returns the auth identity (identity.subject = authUserId).
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<AuthIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

/**
 * Returns the authenticated user's app-level record, or throws.
 * Use for mutations that require a known user.
 */
export async function requireAuthUser(
  ctx: QueryCtx | MutationCtx
): Promise<{ identity: AuthIdentity; user: Doc<"users"> }> {
  const identity = await requireAuth(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
    .first();
  if (!user) {
    throw new Error("User not found");
  }
  return { identity, user };
}

/**
 * Returns the authenticated user's app-level record, or null if not authenticated
 * or no user record exists. Use for queries that should gracefully degrade.
 */
export async function getOptionalAuthUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
    .first();
}

/**
 * Requires authentication and verifies room membership.
 * Returns the identity, user, and membership records.
 */
export async function requireRoomMember(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">
): Promise<{
  identity: AuthIdentity;
  user: Doc<"users">;
  membership: Doc<"roomMemberships">;
}> {
  const { identity, user } = await requireAuthUser(ctx);
  const membership = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room_user", (q) =>
      q.eq("roomId", roomId).eq("userId", user._id)
    )
    .first();
  if (!membership) {
    throw new Error("Not a member of this room");
  }
  return { identity, user, membership };
}

/**
 * What an authorization guard is being asked to permit. The caller names the
 * category or relationship verb; it cannot know the target's role, so the
 * guard fills targetRole itself for target-constrained verbs.
 */
export type RequireCanSpec =
  | { kind: "category"; category: PermissionCategory }
  | {
      kind: "relationship";
      verb: "remove" | "promote" | "demote" | "transfer" | "changePerms";
    };

/**
 * The permission guard: the single authorization entry point for room
 * mutations. Does the IO — loads the room and memberships, computes owner
 * absence, fetches the target for target-constrained verbs — assembles the
 * precise Action, calls evaluate, and throws a reason-derived message on
 * denial. Returns the loaded bundle so callers stop re-fetching.
 *
 * Identity rules (self-transfer, authoritative ownerId) are NOT enforced here;
 * they stay in the calling handler, after the guard.
 */
export async function requireCan(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
  spec: RequireCanSpec,
  targetUserId?: Id<"users">
): Promise<{
  identity: AuthIdentity;
  user: Doc<"users">;
  membership: Doc<"roomMemberships">;
  room: Doc<"rooms">;
  target?: Doc<"roomMemberships">;
}> {
  const { identity, user, membership } = await requireRoomMember(ctx, roomId);
  const room = await ctx.db.get(roomId);
  if (!room) {
    throw new Error("Room not found");
  }

  const permissions = getEffectivePermissions(room);
  const actorRole = getEffectiveRole(membership);

  let action: Action;
  let target: Doc<"roomMemberships"> | undefined;

  if (spec.kind === "category") {
    action = {
      kind: "category",
      category: spec.category,
      level: permissions[spec.category],
    };
  } else {
    // Relationship verb. Fetch the target membership whenever a target is
    // supplied; fill targetRole only for the target-constrained verbs.
    if (targetUserId !== undefined) {
      target =
        (await ctx.db
          .query("roomMemberships")
          .withIndex("by_room_user", (q) =>
            q.eq("roomId", roomId).eq("userId", targetUserId)
          )
          .first()) ?? undefined;
      if (!target) {
        throw new Error("Target user is not a member of this room");
      }
    }

    if (
      spec.verb === "remove" ||
      spec.verb === "promote" ||
      spec.verb === "demote"
    ) {
      if (!target) {
        throw new Error("Target user is not a member of this room");
      }
      action = {
        kind: "relationship",
        verb: spec.verb,
        targetRole: getEffectiveRole(target),
      };
    } else {
      action = { kind: "relationship", verb: spec.verb };
    }
  }

  // Owner absence only refines an owner-level denial (see evaluate); for any
  // other action it can't change the result, so skip the DB read.
  const ownerAbsent = requiresOwnerLevel(action)
    ? await isRoomOwnerAbsent(ctx, room)
    : false;

  const decision = resolve(action, { actorRole, permissions, ownerAbsent });
  if (!decision.allowed) {
    throw new Error(decision.message);
  }

  return { identity, user, membership, room, target };
}
