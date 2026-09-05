import { Doc } from "./_generated/dataModel";
import { CLAIM_DENIED } from "./retroCopy";

// --- Types ---

export type MemberRole = "owner" | "facilitator" | "participant";

export type PermissionLevel = "everyone" | "facilitators" | "owner";

/** The poker room's four owner-configurable categories. */
export type PokerPermissionCategory =
  | "revealCards"
  | "gameFlow"
  | "issueManagement"
  | "roomSettings";

/** The retro room's four owner-configurable categories (ADR-0013, spec §4.2). */
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
 * Retro has no back-compat to honour, so its defaults are chosen (ADR-0013):
 * advance moves everyone's shared pointer; rewriting another's card
 * default-open is wrong in a candour ceremony; gating action creation makes
 * the facilitator a bottleneck on the one thing that buys follow-through.
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
export type DenialReason =
  | "insufficient-role"
  | "owner-absent"
  | "target-rank"
  | "owner-present";

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
      verb: "transfer" | "changePerms" | "ratchet" | "delete" | "claim";
    };

/**
 * A member's role in the Team that owns the room, when it has one. Populated
 * by the guard only for rooms with a `teamId`; never a room power except for
 * `claim` (ADR-0013).
 */
export type TeamRole = "admin" | "member";

/**
 * The inputs the permission decision depends on: the actor's role, the room's
 * permissions, whether the owner is absent, and — for `claim` — the actor's
 * team role and whether the owner is still in the Team. No DB, no identity.
 */
export type DecisionContext = {
  actorRole: MemberRole;
  permissions: RoomPermissions | RetroPermissions;
  ownerAbsent: boolean;
  actorTeamRole?: TeamRole;
  ownerInTeam: boolean;
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
    case "ratchet":
    case "delete": {
      // Owner-only, no target constraint.
      return decideRole(ctx, ctx.actorRole === "owner", requiresOwnerLevel(action));
    }
    case "claim": {
      // A team admin's one room power (ADR-0013): take ownership of a room
      // whose owner is absent or no longer in the Team. Room role never
      // substitutes for team role, and a present in-team owner must transfer.
      if (ctx.actorTeamRole !== "admin") {
        return { allowed: false, reason: "insufficient-role" };
      }
      return ctx.ownerAbsent || !ctx.ownerInTeam
        ? { allowed: true }
        : { allowed: false, reason: "owner-present" };
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
    action.verb === "ratchet" ||
    action.verb === "delete"
  );
}

/**
 * Whether the decision reads `ownerAbsent` at all: every owner-level action
 * (it refines the denial reason) and `claim` (it decides the outcome). The
 * guard skips the owner-absence DB read for everything else.
 */
export function readsOwnerAbsence(action: Action): boolean {
  if (requiresOwnerLevel(action)) return true;
  return action.kind === "relationship" && action.verb === "claim";
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

  if (reason === "owner-present") {
    return CLAIM_DENIED;
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
  if (action.kind === "relationship" && action.verb === "claim") {
    return "Only a team admin can claim this room.";
  }
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

// --- Join decision (pure) ---

/** Who may join a room (ADR-0013, spec §4.4). */
export type JoinPolicy = "anyone" | "permanentAccounts" | "teamMembers";

/** Whether a retro's cards carry their author (ADR-0012). */
export type Attribution = "named" | "anonymous";

/**
 * The bundle a Team carries and copies by value onto every retro created in
 * it (ADR-0013, spec §5). Shared by the schema, the model and the client.
 */
export type RetroDefaults = {
  attribution: Attribution;
  joinPolicy: JoinPolicy;
  permissions: RetroPermissions;
};

export type AccountType = "anonymous" | "permanent";

export type JoinDenialReason = "permanent-account-required" | "team-members-only";

export type JoinDecision =
  | { allowed: true }
  | { allowed: false; reason: JoinDenialReason };

/**
 * The join decision: may this account become a member under this policy. A
 * pure function beside `evaluate`, not a branch of it — a joiner has no
 * membership and no role. A team member satisfies every policy: access is
 * the stronger claim, and someone who may read the archive may sit in the
 * room. Shared by the `joinRoom` adapter and the join page's disabled state.
 */
export function evaluateJoin(
  policy: JoinPolicy,
  accountType: AccountType,
  isTeamMember: boolean
): JoinDecision {
  if (isTeamMember) return { allowed: true };
  switch (policy) {
    case "anyone":
      return { allowed: true };
    case "permanentAccounts":
      return accountType === "permanent"
        ? { allowed: true }
        : { allowed: false, reason: "permanent-account-required" };
    case "teamMembers":
      return { allowed: false, reason: "team-members-only" };
    default:
      return assertNever(policy);
  }
}

/**
 * The server's one derivation of the join decision's `accountType`: permanent
 * only when the user row says so, anonymous otherwise (an undefined row value
 * is anonymous). The auth session's anonymous flag is never the input.
 */
export function accountTypeOf(user: Pick<Doc<"users">, "accountType">): AccountType {
  return user.accountType === "permanent" ? "permanent" : "anonymous";
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
