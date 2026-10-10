import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc, TableNames } from "../_generated/dataModel";
import {
  PermissionCategory,
  Action,
  resolve,
  requiresOwnerLevel,
  getEffectivePermissions,
  categoryLevel,
  getEffectiveRole,
  type ResolvedDecision,
} from "../permissions";
import { isRoomOwnerAbsent } from "./permissions";
import { getMembership } from "./memberships";
import { refusal } from "./refusal";
import { NOT_THIS_CEREMONY } from "../ceremony";
import { requireCaller, requireUser, type Caller } from "./caller";

/**
 * The caller's auth identity (model/caller.ts).
 * identity.subject is the BetterAuth user ID (authUserId).
 */
interface AuthIdentity {
  subject: string;
  [key: string]: unknown;
}

/**
 * Returns the caller (model/caller.ts), or throws unless they are signed in
 * as `authUserId`. For mutations that still take the caller's authUserId as
 * an argument (older browsers send it): the argument must name the caller.
 */
export async function requireAuthAs(
  ctx: QueryCtx | MutationCtx,
  authUserId: string
): Promise<Caller> {
  const caller = await requireCaller(ctx);
  if (caller.identity.subject !== authUserId) {
    throw new Error("Auth identity mismatch");
  }
  return caller;
}

/**
 * Room attendance: requires authentication and verifies room membership.
 * Returns the identity, user and membership records, and the room it
 * checked, so a write never reads the room again. A read-only query takes
 * `requireRoomReader` instead, which reads no room.
 */
export async function requireRoomMember(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">
): Promise<{
  identity: AuthIdentity;
  user: Doc<"users">;
  membership: Doc<"roomMemberships">;
  room: Doc<"rooms">;
}> {
  const { identity, user } = await requireUser(ctx);
  const membership = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room_user", (q) =>
      q.eq("roomId", roomId).eq("userId", user._id)
    )
    .first();
  if (!membership) {
    throw refusal("forbidden", "Not a member of this room");
  }
  const room = await ctx.db.get("rooms", roomId);
  if (!room) {
    throw new Error("Room not found");
  }
  return { identity, user, membership, room };
}

/**
 * Room access (ADR-0009): may the authenticated user *read* this room's
 * contents? Passes a room member, deciding from the caller and their
 * membership alone, and returns the identity and user. It reads no room: a
 * guard's reads join the read set of every query that takes it, so a room
 * patch would re-run them all. A query that needs the room reads it itself.
 * Every read-only query on room-owned data takes this guard; every mutation
 * keeps `requireRoomMember` (attendance).
 */
export async function requireRoomReader(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">
): Promise<{
  identity: AuthIdentity;
  user: Doc<"users">;
}> {
  const { identity, user } = await requireUser(ctx);
  const membership = await getMembership(ctx, roomId, user._id);
  if (!membership) {
    throw new Error("You don't have access to this room");
  }
  return { identity, user };
}

/**
 * Requires authentication and room membership, and verifies the authenticated
 * user IS `userId` — handlers that accept a userId argument must not let one
 * member act as another. Returns the verified identity, user, and membership,
 * and the room the attendance guard checked.
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
  room: Doc<"rooms">;
}> {
  const { identity, user, membership, room } = await requireRoomMember(ctx, roomId);
  if (user._id !== userId) {
    throw new Error(message);
  }
  return { identity, user, membership, room };
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
        | "delete";
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
  const { identity, user, membership, room } = await requireRoomMember(ctx, roomId);
  const bundle = await guardRoomAction(
    ctx,
    user,
    membership,
    room,
    spec,
    targetUserId
  );
  return { identity, ...bundle };
}

/**
 * The explicit-user entry point to the same permission guard, for callers
 * that resolved the user outside ctx.auth (e.g. an action that authenticated
 * via an explicit authUserId and called in through an internal query).
 * Resolves the actor's membership and the room, then funnels into the same
 * shared assembly as requireCan — same Action, same decision, same thrown
 * messages.
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
    throw refusal("forbidden", "Not a member of this room");
  }
  const room = await ctx.db.get("rooms", roomId);
  if (!room) {
    throw new Error("Room not found");
  }
  return guardRoomAction(ctx, user, membership, room, spec, targetUserId);
}

/**
 * What a room write is addressed by: its room, or the one issue, sticky or
 * action item it acts on (`{ issue: issueId }`), which lands the write in
 * that entity's own room. A second id beside the room, such as a note's
 * issue, is not an address: the model checks it against the room.
 */
export type RoomAddress =
  | Id<"rooms">
  | { issue: Id<"issues"> }
  | { sticky: Id<"retroStickies"> }
  | { actionItem: Id<"retroActionItems"> };

/**
 * What the room-scoped step hands a write's handler: the caller's users row
 * and membership, the room, the target of a relationship verb, and the
 * entity an address named, under the address's key (`issue` for
 * `{ issue: issueId }`).
 */
export type RoomWrite<A extends RoomAddress = Id<"rooms">> = GuardBundle &
  (A extends Id<"rooms">
    ? unknown
    : { [K in keyof A]: A[K] extends Id<infer T extends TableNames> ? Doc<T> : never });

/**
 * The room-scoped step every room write starts with, so that no handler works
 * out by hand who is calling, which room the write lands in, or whether what
 * it acts on is in that room. Loads the entity the address names (refused as
 * missing once it is gone), seats the caller in its room or the room
 * addressed (who is signed in, through model/caller.ts, and their membership:
 * room attendance), runs the permission guard when `spec` names an action,
 * and hands over every row it loaded.
 *
 * Who is calling comes from the session alone: a write that still takes the
 * caller's own user id, for old browsers, ignores it. The room's activity
 * clock stays in the model, which server-originated writes share (ADR-0005).
 */
export async function requireRoomWrite<A extends RoomAddress>(
  ctx: MutationCtx,
  address: A,
  spec?: RequireCanSpec,
  targetUserId?: Id<"users">
): Promise<RoomWrite<A>> {
  const { roomId, ...entity } = await addressed(ctx, address);
  const { user, membership, room } = await requireRoomMember(ctx, roomId);
  const bundle = spec
    ? await guardRoomAction(ctx, user, membership, room, spec, targetUserId)
    : { user, membership, room };
  return { ...bundle, ...entity } as RoomWrite<A>;
}

/** The room an address lands a write in, and the entity it names, loaded. */
async function addressed(ctx: MutationCtx, address: RoomAddress) {
  if (typeof address === "string") return { roomId: address };
  if ("issue" in address) {
    const issue = await ctx.db.get("issues", address.issue);
    if (!issue) throw refusal("missing", "Issue not found");
    return { roomId: issue.roomId, issue };
  }
  if ("sticky" in address) {
    const sticky = await ctx.db.get("retroStickies", address.sticky);
    if (!sticky) throw refusal("missing", "That sticky is gone.");
    return { roomId: sticky.roomId, sticky };
  }
  const actionItem = await ctx.db.get("retroActionItems", address.actionItem);
  if (!actionItem) throw refusal("missing", "That action item is gone.");
  return { roomId: actionItem.roomId, actionItem };
}

/**
 * The guard's shared IO assembly, given the actor's user, membership and room
 * from either authentication mode. Resolves the action through
 * `resolveRoomAction` and refuses with the resolved decision's message on
 * denial, a coded refusal the browser can show (ADR-0031). Returns the
 * loaded bundle.
 */
async function guardRoomAction(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  membership: Doc<"roomMemberships">,
  room: Doc<"rooms">,
  spec: RequireCanSpec,
  targetUserId?: Id<"users">
): Promise<GuardBundle> {
  const { decision, target } = await resolveRoomAction(
    ctx,
    membership,
    room,
    spec,
    targetUserId
  );
  if (!decision.allowed) {
    throw refusal("forbidden", decision.message);
  }
  return { user, membership, room, target };
}

/**
 * The decision for an action in a loaded room, returned rather than thrown:
 * the same IO assembly the guard uses — the precise Action, the target for
 * target-constrained verbs, owner absence only when an owner-level outcome
 * could depend on it — for a caller whose denial depends on the target (a
 * retro sticky someone else wrote). Throws only when the category has no
 * level in this room's ceremony (ADR-0013) or a target is not a member,
 * which are caller errors, not denials.
 */
export async function resolveRoomAction(
  ctx: QueryCtx | MutationCtx,
  membership: Doc<"roomMemberships">,
  room: Doc<"rooms">,
  spec: RequireCanSpec,
  targetUserId?: Id<"users">
): Promise<{ decision: ResolvedDecision; target?: Doc<"roomMemberships"> }> {
  const roomId = room._id;
  const effective = getEffectivePermissions(room);
  const actorRole = getEffectiveRole(membership);

  let action: Action;
  let target: Doc<"roomMemberships"> | undefined;

  if (spec.kind === "category") {
    // A category from the other ceremony has no level here (ADR-0013).
    const level = categoryLevel(effective, spec.category);
    if (level === undefined) {
      throw refusal("missing", NOT_THIS_CEREMONY);
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

  // Owner absence refines an owner-level denial (see evaluate); for any
  // other action it can't change the result, so skip the DB read.
  const ownerAbsent = requiresOwnerLevel(action)
    ? await isRoomOwnerAbsent(ctx, room)
    : false;

  const decision = resolve(action, {
    actorRole,
    permissions: effective.permissions,
    ownerAbsent,
  });
  return { decision, target };
}
