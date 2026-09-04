import { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import {
  PermissionCategory,
  Action,
  resolve,
  readsOwnerAbsence,
  getEffectivePermissions,
  categoryLevel,
  getEffectiveRole,
  TeamRole,
} from "../permissions";
import { isRoomOwnerAbsent } from "./permissions";
import { getMembership } from "./users";
import { getTeamMembership } from "./teams";
import { NOT_A_TEAM_MEMBER, TEAM_ADMIN_ONLY, TEAM_NOT_FOUND } from "../teamCopy";

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
 * Works in any function context — it only reads ctx.auth, which actions
 * have too.
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx | ActionCtx
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
 * Room access (ADR-0009): may the authenticated user *read* this room's
 * contents? Passes a room member or a member of the room's Team (ADR-0008).
 * Returns the identity, user and room — never a membership row, because a
 * reader need not be an attendee. Every read-only query on room-owned data
 * takes this guard; every mutation keeps `requireRoomMember` (attendance).
 */
export async function requireRoomReader(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">
): Promise<{
  identity: AuthIdentity;
  user: Doc<"users">;
  room: Doc<"rooms">;
}> {
  const { identity, user } = await requireAuthUser(ctx);
  const [room, membership] = await Promise.all([
    ctx.db.get(roomId),
    getMembership(ctx, roomId, user._id),
  ]);
  if (!room) {
    throw new Error("Room not found");
  }
  if (!membership && !(await isTeamMemberOfRoom(ctx, room, user._id))) {
    // The copy speaks of access, not attendance — this guard never asks
    // whether you are *in* the room (ADR-0009).
    throw new Error("You don't have access to this room");
  }
  return { identity, user, room };
}

/**
 * The reader guard's Team half: the room has a Team, that Team's row still
 * exists, and the user holds a membership in it. A room whose Team row is
 * gone (mid-cascade, or after it) denies like any other non-member rather
 * than throwing "Team not found" — the caller asked about access, and the
 * answer is no.
 */
async function isTeamMemberOfRoom(
  ctx: QueryCtx | MutationCtx,
  room: Doc<"rooms">,
  userId: Id<"users">
): Promise<boolean> {
  if (!room.teamId) return false;
  const [team, teamMembership] = await Promise.all([
    ctx.db.get(room.teamId),
    getTeamMembership(ctx, room.teamId, userId),
  ]);
  return team !== null && teamMembership !== null;
}

/**
 * The Team guard (ADR-0008, spec §4.1): may the authenticated user act on
 * this Team? "member" passes any membership row; "admin" passes an admin's.
 * Every team mutation and the members-only team reads run it. Team role
 * grants no room power (the one exception, `claim`, goes through the room
 * guard's DecisionContext, not through here).
 */
export async function requireTeamRole(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
  role: TeamRole
): Promise<{
  identity: AuthIdentity;
  user: Doc<"users">;
  team: Doc<"teams">;
  membership: Doc<"teamMemberships">;
}> {
  const { identity, user } = await requireAuthUser(ctx);
  const [team, membership] = await Promise.all([
    ctx.db.get(teamId),
    getTeamMembership(ctx, teamId, user._id),
  ]);
  if (!team) {
    throw new Error(TEAM_NOT_FOUND);
  }
  if (!membership) {
    throw new Error(NOT_A_TEAM_MEMBER);
  }
  if (role === "admin" && membership.role !== "admin") {
    throw new Error(TEAM_ADMIN_ONLY);
  }
  return { identity, user, team, membership };
}

/**
 * Requires authentication and room membership, and verifies the authenticated
 * user IS `userId` — handlers that accept a userId argument must not let one
 * member act as another. Returns the verified identity, user, and membership.
 *
 * `message` preserves each handler's existing denial copy; it is thrown only
 * on the acting-user mismatch (membership failures throw from requireRoomMember).
 */
export async function requireActingUser(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">,
  message = "Cannot act as another user"
): Promise<{
  identity: AuthIdentity;
  user: Doc<"users">;
  membership: Doc<"roomMemberships">;
}> {
  const { identity, user, membership } = await requireRoomMember(ctx, roomId);
  if (user._id !== userId) {
    throw new Error(message);
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
      verb:
        | "remove"
        | "promote"
        | "demote"
        | "transfer"
        | "changePerms"
        | "ratchet"
        | "delete"
        | "claim";
    };

/**
 * The loaded bundle the guard returns: everything its IO assembly fetched
 * while assembling the Action. `requireCan` adds the identity it
 * authenticated with; the explicit-user entry point has none to add.
 */
export type GuardBundle = {
  user: Doc<"users">;
  membership: Doc<"roomMemberships">;
  room: Doc<"rooms">;
  target?: Doc<"roomMemberships">;
};

/**
 * The permission guard: the single authorization entry point for room
 * mutations, authenticating via ctx.auth. Funnels into the shared assembly
 * (guardRoomAction) and returns the loaded bundle plus the identity, so
 * callers stop re-fetching.
 *
 * Identity rules (self-transfer, authoritative ownerId) are NOT enforced here;
 * they stay in the calling handler, after the guard.
 */
export async function requireCan(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
  spec: RequireCanSpec,
  targetUserId?: Id<"users">
): Promise<GuardBundle & { identity: AuthIdentity }> {
  const { identity, user, membership } = await requireRoomMember(ctx, roomId);
  const bundle = await guardRoomAction(
    ctx,
    user,
    membership,
    roomId,
    spec,
    targetUserId
  );
  return { identity, ...bundle };
}

/**
 * The explicit-user entry point to the same permission guard, for callers
 * that resolved the user outside ctx.auth (e.g. an action that authenticated
 * via an explicit authUserId and called in through an internal query).
 * Resolves the actor's membership, then funnels into the same shared assembly
 * as requireCan — same Action, same decision, same thrown messages.
 */
export async function requireCanForUser(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  roomId: Id<"rooms">,
  spec: RequireCanSpec,
  targetUserId?: Id<"users">
): Promise<GuardBundle> {
  const membership = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room_user", (q) =>
      q.eq("roomId", roomId).eq("userId", user._id)
    )
    .first();
  if (!membership) {
    throw new Error("Not a member of this room");
  }
  return guardRoomAction(ctx, user, membership, roomId, spec, targetUserId);
}

/**
 * The guard's shared IO assembly, given the actor's user and membership from
 * either authentication mode. Loads the room, assembles the precise Action,
 * fetches the target for target-constrained verbs, reads owner absence only
 * when an owner-level outcome could depend on it, calls resolve, and throws
 * the resolved decision's message on denial. Returns the loaded bundle.
 */
async function guardRoomAction(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  membership: Doc<"roomMemberships">,
  roomId: Id<"rooms">,
  spec: RequireCanSpec,
  targetUserId?: Id<"users">
): Promise<GuardBundle> {
  const room = await ctx.db.get(roomId);
  if (!room) {
    throw new Error("Room not found");
  }

  const effective = getEffectivePermissions(room);
  const actorRole = getEffectiveRole(membership);

  let action: Action;
  let target: Doc<"roomMemberships"> | undefined;

  if (spec.kind === "category") {
    // A category from the other ceremony has no level here (ADR-0013).
    const level = categoryLevel(effective, spec.category);
    if (level === undefined) {
      throw new Error("This action does not apply to this room type.");
    }
    action = { kind: "category", category: spec.category, level };
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

  // Owner absence refines an owner-level denial and decides `claim` (see
  // evaluate); for any other action it can't change the result, so skip the
  // DB read.
  const ownerAbsent = readsOwnerAbsence(action)
    ? await isRoomOwnerAbsent(ctx, room)
    : false;

  // Team inputs (ADR-0013): populated only for rooms with a `teamId`, and
  // only when the action reads them (`claim`). A teamless room grants no
  // team role, so `claim` is insufficient-role for everyone there.
  const team =
    action.kind === "relationship" && action.verb === "claim"
      ? await readTeamInputs(ctx, room, user._id)
      : { ownerInTeam: false };
  const decision = resolve(action, {
    actorRole,
    permissions: effective.permissions,
    ownerAbsent,
    ...(team.actorTeamRole ? { actorTeamRole: team.actorTeamRole } : {}),
    ownerInTeam: team.ownerInTeam,
  });
  if (!decision.allowed) {
    throw new Error(decision.message);
  }

  return { user, membership, room, target };
}

/**
 * The `claim` inputs (ADR-0013): the actor's team role and whether the room
 * owner still holds a membership in the room's Team. Both are read from the
 * Team the room names; a teamless room yields neither.
 */
async function readTeamInputs(
  ctx: QueryCtx | MutationCtx,
  room: Doc<"rooms">,
  actorUserId: Id<"users">
): Promise<{ actorTeamRole?: TeamRole; ownerInTeam: boolean }> {
  if (!room.teamId) return { ownerInTeam: false };
  const [actor, owner] = await Promise.all([
    getTeamMembership(ctx, room.teamId, actorUserId),
    room.ownerId ? getTeamMembership(ctx, room.teamId, room.ownerId) : null,
  ]);
  return {
    ...(actor ? { actorTeamRole: actor.role } : {}),
    ownerInTeam: owner !== null,
  };
}
