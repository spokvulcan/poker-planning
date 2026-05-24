import { Doc } from "./_generated/dataModel";

// --- Types ---

export type MemberRole = "owner" | "facilitator" | "participant";

export type PermissionLevel = "everyone" | "facilitators" | "owner";

export type PermissionCategory =
  | "revealCards"
  | "gameFlow"
  | "issueManagement"
  | "roomSettings";

export type RoomPermissions = {
  [K in PermissionCategory]: PermissionLevel;
};

// --- Defaults ---

export const DEFAULT_PERMISSIONS: RoomPermissions = {
  revealCards: "everyone",
  gameFlow: "everyone",
  issueManagement: "everyone",
  roomSettings: "everyone",
};

// --- Permission decision (pure) ---

/**
 * Why a Decision was denied. The reason classifies the denial; user-facing
 * copy is derived from it via denialMessage, never embedded here.
 */
export type DenialReason = "insufficient-role" | "owner-absent" | "target-rank";

/**
 * The verdict returned by evaluate. Pure value — no IO, no identity.
 */
export type Decision =
  | { allowed: true }
  | { allowed: false; reason: DenialReason };

/**
 * What an actor is attempting. Either a category action (one of the four
 * configurable categories, carrying its resolved level for messaging) or a
 * relationship action. Relationship verbs that constrain the target's role
 * require targetRole in the type; transfer/changePerms do not.
 */
export type Action =
  | { kind: "category"; category: PermissionCategory; level: PermissionLevel }
  | {
      kind: "relationship";
      verb: "remove" | "promote" | "demote";
      targetRole: MemberRole;
    }
  | { kind: "relationship"; verb: "transfer" | "changePerms" };

/**
 * The inputs the permission decision depends on: the actor's role, the room's
 * permissions, and whether the owner is absent. No DB, no identity.
 */
export type DecisionContext = {
  actorRole: MemberRole;
  permissions: RoomPermissions;
  ownerAbsent: boolean;
};

/**
 * Whether a role satisfies a required permission level.
 * - "everyone" → any role
 * - "facilitators" → facilitator or owner
 * - "owner" → owner only
 */
function roleSatisfiesLevel(role: MemberRole, level: PermissionLevel): boolean {
  if (level === "everyone") return true;
  if (level === "facilitators")
    return role === "facilitator" || role === "owner";
  return role === "owner";
}

/**
 * The single permission decision: may an actor take an action in a room.
 *
 * Role check precedes target check — if the actor's role already fails, the
 * reason is "insufficient-role" (or "owner-absent"), never "target-rank".
 *
 * ownerAbsent refines the reason, never the outcome: an absent owner already
 * fails any owner-level role check, so ownerAbsent only flips the reason to
 * "owner-absent". See docs/adr/0001-lockdown-is-a-denial-reason-not-a-gate.md.
 */
export function evaluate(action: Action, ctx: DecisionContext): Decision {
  if (action.kind === "category") {
    return decideRole(
      ctx,
      roleSatisfiesLevel(ctx.actorRole, action.level),
      requiresOwnerLevel(action)
    );
  }

  // Relationship actions: a role check, then (for target-constrained verbs) a
  // target-rank check. Role always precedes target.
  switch (action.verb) {
    case "transfer":
    case "changePerms": {
      // Owner-only, no target constraint.
      return decideRole(ctx, ctx.actorRole === "owner", requiresOwnerLevel(action));
    }
    case "demote": {
      // Owner-only; target must be a facilitator.
      const roleDecision = decideRole(
        ctx,
        ctx.actorRole === "owner",
        requiresOwnerLevel(action)
      );
      if (!roleDecision.allowed) return roleDecision;
      return action.targetRole === "facilitator"
        ? { allowed: true }
        : { allowed: false, reason: "target-rank" };
    }
    case "promote": {
      // Owner or facilitator; target must be a participant.
      const roleDecision = decideRole(
        ctx,
        ctx.actorRole === "owner" || ctx.actorRole === "facilitator",
        requiresOwnerLevel(action)
      );
      if (!roleDecision.allowed) return roleDecision;
      return action.targetRole === "participant"
        ? { allowed: true }
        : { allowed: false, reason: "target-rank" };
    }
    case "remove": {
      // owner removes anyone; facilitator removes participants only.
      const roleDecision = decideRole(
        ctx,
        ctx.actorRole !== "participant",
        requiresOwnerLevel(action)
      );
      if (!roleDecision.allowed) return roleDecision;
      if (ctx.actorRole === "owner") return { allowed: true };
      return action.targetRole === "participant"
        ? { allowed: true }
        : { allowed: false, reason: "target-rank" };
    }
    default:
      return assertNever(action);
  }
}

/** Exhaustiveness guard — unreachable for a well-typed Action. */
function assertNever(action: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(action)}`);
}

/**
 * Whether an action's role requirement is owner-level. Drives both the
 * owner-absent refinement and the "Only the owner..." denial copy. Exported so
 * the guard can skip the owner-absence DB read when it can't affect the result.
 */
export function requiresOwnerLevel(action: Action): boolean {
  if (action.kind === "category") return action.level === "owner";
  return (
    action.verb === "transfer" ||
    action.verb === "changePerms" ||
    action.verb === "demote"
  );
}

/**
 * The single source of denial copy, derived from the action and reason and
 * shared by the backend guard's throw and the frontend tooltip. Copy is never
 * embedded in the Decision — it is reconstructed here.
 */
export function denialMessage(action: Action, reason: DenialReason): string {
  if (reason === "owner-absent") {
    return "Room owner has left. Owner-level actions are disabled until the owner returns.";
  }

  if (reason === "target-rank") {
    if (action.kind === "relationship") {
      if (action.verb === "remove")
        return "Facilitators can only remove participants.";
      if (action.verb === "promote")
        return "Only participants can be promoted to facilitator.";
      if (action.verb === "demote") return "Only facilitators can be demoted.";
    }
    return "You don't have permission to do this.";
  }

  // insufficient-role
  return requiresOwnerLevel(action)
    ? "Only the owner can do this."
    : "Only facilitators and the owner can do this.";
}

/**
 * A Decision whose denial reason has already been resolved to its user-facing
 * message. The allowed branch carries no message (and `message?: never` makes
 * `message` narrow to `string` after an `!allowed` check, so callers need no
 * fallback). The machine-readable reason is intentionally NOT exposed — callers
 * needing it call `evaluate` directly.
 */
export type ResolvedDecision =
  | { allowed: true; message?: never }
  | { allowed: false; message: string };

/**
 * The shared allowed value `resolve` returns on every allow. A module-level
 * singleton so an allow that stays an allow keeps a stable identity across
 * recomputes (protects downstream memoization).
 */
export const RESOLVED_ALLOWED: ResolvedDecision = { allowed: true };

/**
 * The single combiner of `evaluate` and `denialMessage`: resolves an action to
 * an allowed value or a denied value carrying its user-facing message. Pure —
 * no IO, no React — so it runs unchanged in a Convex function and the browser.
 * Shared by the backend guard's throw, the Jira push, and the frontend tooltip.
 */
export function resolve(
  action: Action,
  ctx: DecisionContext
): ResolvedDecision {
  const decision = evaluate(action, ctx);
  if (decision.allowed) return RESOLVED_ALLOWED;
  return { allowed: false, message: denialMessage(action, decision.reason) };
}

/**
 * Builds a Decision from a role check, refining the denial reason to
 * "owner-absent" when an owner-level requirement fails under lockdown.
 */
function decideRole(
  ctx: DecisionContext,
  roleOk: boolean,
  requiresOwner: boolean
): Decision {
  if (roleOk) return { allowed: true };
  return {
    allowed: false,
    reason: requiresOwner && ctx.ownerAbsent ? "owner-absent" : "insufficient-role",
  };
}

// --- Helpers ---

/**
 * Returns the effective permissions for a room, falling back to defaults
 * for legacy rooms without permissions set.
 */
export function getEffectivePermissions(room: Doc<"rooms">): RoomPermissions {
  return room.permissions ?? DEFAULT_PERMISSIONS;
}

/**
 * Returns the effective role for a membership, defaulting to "participant"
 * for legacy memberships without a role.
 */
export function getEffectiveRole(
  membership: Doc<"roomMemberships">
): MemberRole {
  return membership.role ?? "participant";
}
