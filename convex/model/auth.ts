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
import { requireUser } from "./caller";

/**
 * The caller's auth identity (model/caller.ts).
 * identity.subject is the BetterAuth user ID (authUserId).
 */
interface AuthIdentity {
  subject: string;
  [key: string]: unknown;
}

/**
 * Room attendance: the caller is signed in, has a users row and a seat in the
 * room. Hands back their row, their membership and the room it checked, so a
 * write never reads the room again. The room-scoped step is its one caller,
 * which is why it isn't exported: every room write takes attendance through
 * the step, and a read-only query takes `requireRoomReader` instead, which
 * reads no room.
 */
async function requireRoomMember(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<{ user: Doc<"users">; membership: Doc<"roomMemberships">; room: Doc<"rooms"> }> {
  const { user } = await requireUser(ctx);
  const membership = await getMembership(ctx, roomId, user._id);
  if (!membership) throw notAMember();
  const room = await ctx.db.get("rooms", roomId);
  if (!room) {
    throw new Error("Room not found");
  }
  return { user, membership, room };
}

/** How every guard refuses a caller who isn't in the room (ADR-0031). */
function notAMember() {
  return refusal("forbidden", "Not a member of this room");
}

/**
 * Room access (ADR-0009): may the authenticated user *read* this room's
 * contents? Passes a room member, deciding from the caller and their
 * membership alone, and returns the identity and user. It reads no room: a
 * guard's reads join the read set of every query that takes it, so a room
 * patch would re-run them all. A query that needs the room reads it itself.
 * Anyone else is refused as attendance refuses them (ADR-0031). Every public
 * query addressed to a room takes this guard, but for the few that are the
 * room's public shell (listed in convex/requireRoomWrite.test.ts); every room
 * write takes attendance through the room-scoped step.
 */
export async function requireRoomReader(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">
): Promise<{
  identity: AuthIdentity;
  user: Doc<"users">;
}> {
  const { identity, user } = await requireUser(ctx);
  if (!(await getMembership(ctx, roomId, user._id))) throw notAMember();
  return { identity, user };
}

/**
 * What an authorization guard is being asked to permit: a category, or a
 * relationship verb. A verb that acts on another member names them
 * (`target`): the guard loads their membership, and fills in their role for
 * the verbs the decision weighs it for (remove, promote, demote), which the
 * caller can't know. `changePerms` and `delete` act on the room alone.
 */
export type RequireCanSpec =
  | { kind: "category"; category: PermissionCategory }
  | { kind: "relationship"; verb: "remove" | "promote" | "demote" | "transfer"; target: Id<"users"> }
  | { kind: "relationship"; verb: "changePerms" | "delete" };

/**
 * The loaded bundle the permission guard returns: everything its IO assembly
 * fetched while assembling the Action.
 */
type GuardBundle = {
  user: Doc<"users">;
  membership: Doc<"roomMemberships">;
  room: Doc<"rooms">;
  target?: Doc<"roomMemberships">;
};

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
 * and membership, the room, the member a relationship verb acts on (`target`,
 * there whenever the spec names one), and the entity an address named, under
 * the address's key (`issue` for `{ issue: issueId }`).
 */
export type RoomWrite<
  A extends RoomAddress = Id<"rooms">,
  S extends RequireCanSpec | undefined = undefined,
> = Omit<GuardBundle, "target"> &
  (S extends { target: Id<"users"> } ? { target: Doc<"roomMemberships"> } : unknown) &
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
 * and hands over every row it loaded. It is the permission guard's one way
 * in.
 *
 * Who is calling comes from the session alone: a write that still takes the
 * caller's own user id, for old browsers, ignores it. Only presence's
 * heartbeat compares the user id it is sent, against the caller seated here,
 * because its component lists whoever a heartbeat names. An action takes the
 * step in the mutations it runs, which run as the action's own caller: the
 * Jira import does, before it calls Jira and for each issue it admits. The
 * room's activity clock stays in the model, which server-originated writes
 * share (ADR-0005).
 */
export async function requireRoomWrite<
  A extends RoomAddress,
  S extends RequireCanSpec | undefined = undefined,
>(ctx: MutationCtx, address: A, spec?: S): Promise<RoomWrite<A, S>> {
  const { roomId, ...entity } = await addressed(ctx, address);
  const { user, membership, room } = await requireRoomMember(ctx, roomId);
  const bundle = spec ? await guardRoomAction(ctx, user, membership, room, spec) : { user, membership, room };
  return { ...bundle, ...entity } as RoomWrite<A, S>;
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
 * The permission guard's shared IO assembly, given the actor's user,
 * membership and room as the room-scoped step seated them. Resolves the
 * action through `resolveRoomAction` and refuses with the resolved decision's
 * message on denial, a coded refusal the browser can show (ADR-0031).
 * Returns the loaded bundle.
 *
 * Identity rules (self-transfer, authoritative ownerId) are NOT enforced here;
 * they stay with the write, after the guard.
 */
async function guardRoomAction(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  membership: Doc<"roomMemberships">,
  room: Doc<"rooms">,
  spec: RequireCanSpec
): Promise<GuardBundle> {
  const { decision, target } = await resolveRoomAction(ctx, membership, room, spec);
  if (!decision.allowed) {
    throw refusal("forbidden", decision.message);
  }
  return { user, membership, room, target };
}

/**
 * The decision for an action in a loaded room, returned rather than thrown:
 * the same IO assembly the guard uses — the precise Action, the target a
 * relationship verb names, owner absence only when an owner-level outcome
 * could depend on it — for a caller whose denial depends on the target (a
 * retro sticky someone else wrote). Throws only when the category has no
 * level in this room's ceremony (ADR-0013) or a target is not a member,
 * which are caller errors, not denials.
 */
export async function resolveRoomAction(
  ctx: QueryCtx | MutationCtx,
  membership: Doc<"roomMemberships">,
  room: Doc<"rooms">,
  spec: RequireCanSpec
): Promise<{ decision: ResolvedDecision; target?: Doc<"roomMemberships"> }> {
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
  } else if ("target" in spec) {
    // A verb that acts on a member: load their membership; the verbs that
    // constrain the target's role carry it.
    const seat = await getMembership(ctx, room._id, spec.target);
    if (!seat) {
      throw new Error("Target user is not a member of this room");
    }
    target = seat;
    action =
      spec.verb === "transfer"
        ? { kind: "relationship", verb: spec.verb }
        : { kind: "relationship", verb: spec.verb, targetRole: getEffectiveRole(seat) };
  } else {
    action = { kind: "relationship", verb: spec.verb };
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
