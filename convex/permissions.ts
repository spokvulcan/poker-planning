import { Doc } from "./_generated/dataModel";

// --- Types ---

export type MemberRole = "owner" | "facilitator" | "participant";

export type PermissionLevel = "everyone" | "facilitators" | "owner";

/** The poker room's four owner-configurable categories. */
export type PokerPermissionCategory =
  | "revealCards"
  | "gameFlow"
  | "issueManagement"
  | "roomSettings";

/**
 * The retro room's four owner-configurable categories: moving the retro
 * through its steps, managing other people's stickies, managing action
 * items, and the retro's settings.
 */
export type RetroPermissionCategory =
  | "stageFlow"
  | "cardManagement"
  | "actionManagement"
  | "retroSettings";

/**
 * Every configurable category across both room types. A category is looked
 * up only after narrowing on the room kind (see `categoryLevel`); the
 * decision itself (`evaluate`) is generic over the name.
 */
export type PermissionCategory = PokerPermissionCategory | RetroPermissionCategory;

/** The poker room's stored permission shape. */
export type RoomPermissions = {
  [K in PokerPermissionCategory]: PermissionLevel;
};

/** The retro room's stored permission shape. */
export type RetroPermissions = {
  [K in RetroPermissionCategory]: PermissionLevel;
};

/**
 * The effective permissions of a room, discriminated on its ceremony
 * (CONTEXT.md: planning poker or retro, named by `roomType`) so a caller
 * narrows before indexing a category. Returned by `getEffectivePermissions`.
 */
export type EffectivePermissions =
  | { ceremony: "poker"; permissions: RoomPermissions }
  | { ceremony: "retro"; permissions: RetroPermissions };

// --- Defaults ---

export const DEFAULT_PERMISSIONS: RoomPermissions = {
  revealCards: "everyone",
  gameFlow: "everyone",
  issueManagement: "everyone",
  roomSettings: "everyone",
};

/**
 * Retro defaults: the facilitator moves everyone through the steps (a stray
 * click on Reveal would end the writing for all); rewriting someone else's
 * sticky is a facilitator's call; anyone may write an action item.
 */
export const DEFAULT_RETRO_PERMISSIONS: RetroPermissions = {
  stageFlow: "facilitators",
  cardManagement: "facilitators",
  actionManagement: "everyone",
  retroSettings: "facilitators",
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
  | {
      kind: "relationship";
      verb: "transfer" | "changePerms" | "delete";
    };

/**
 * The inputs the permission decision depends on: the actor's role, the room's
 * permissions, and whether the owner is absent. No DB, no identity.
 */
export type DecisionContext = {
  actorRole: MemberRole;
  permissions: RoomPermissions | RetroPermissions;
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
    case "changePerms":
    case "delete": {
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

/** Exhaustiveness guard — unreachable for a well-typed input. */
function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
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
    action.verb === "demote" ||
    action.verb === "delete"
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
 * recomputes (protects downstream memoization). Frozen so a stray mutation
 * can't corrupt the value every allow across the backend and browser shares.
 */
export const RESOLVED_ALLOWED: ResolvedDecision = Object.freeze({
  allowed: true,
});

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
 * Returns the effective permissions for a room, keyed by its ceremony: the
 * poker set for roomType "canvas" or undefined, the retro set for "retro".
 * Falls back to that ceremony's defaults when nothing is stored — or when the
 * stored shape belongs to the other ceremony, which no writer produces but the
 * union schema cannot rule out.
 */
export function getEffectivePermissions(
  room: Pick<Doc<"rooms">, "roomType" | "permissions">
): EffectivePermissions {
  const stored = room.permissions;
  if (room.roomType === "retro") {
    return {
      ceremony: "retro",
      permissions:
        stored && "stageFlow" in stored ? stored : DEFAULT_RETRO_PERMISSIONS,
    };
  }
  return {
    ceremony: "poker",
    permissions:
      stored && "revealCards" in stored ? stored : DEFAULT_PERMISSIONS,
  };
}

/**
 * The level a category resolves to in a room's effective permissions, or
 * undefined when the category belongs to the other ceremony (a poker
 * mutation invoked on a retro room, or vice versa). The permissions object
 * *is* the ceremony's category set, so an absent key is the narrowing.
 */
export function categoryLevel(
  effective: EffectivePermissions,
  category: PermissionCategory
): PermissionLevel | undefined {
  const levels: Partial<Record<PermissionCategory, PermissionLevel>> =
    effective.permissions;
  return levels[category];
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
