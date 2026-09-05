import { useMemo } from "react";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type MemberRole,
  type RoomPermissions,
  type RetroPermissions,
  type ResolvedDecision,
  type PermissionCategory,
  type PermissionLevel,
  type DecisionContext,
  type EffectivePermissions,
  DEFAULT_PERMISSIONS,
  RESOLVED_ALLOWED,
  getEffectivePermissions,
  resolve,
} from "@/convex/permissions";

/**
 * The denial overlay a control spreads on top of its own attributes. Allowed
 * yields an empty overlay (the control keeps its own disabled state and label);
 * denied forces `disabled` and overrides the accessible label with the denial
 * copy. Always spread it AFTER the control's own attributes.
 */
export type PermissionOverlay =
  | Record<string, never>
  | { disabled: true; title: string; "aria-label": string };

/**
 * Maps a ResolvedDecision to the denial overlay a control composes by spreading
 * it last. Pure. Owns denial-attribute wiring only — `className` and
 * disabled-styling stay in each control because they vary presentationally.
 */
export function permissionProps(rd: ResolvedDecision): PermissionOverlay {
  if (rd.allowed) return {};
  return { disabled: true, title: rd.message, "aria-label": rd.message };
}

/**
 * The input-kind overlay: like `permissionProps`, but denies via `readOnly`
 * instead of `disabled` so the field stays focusable and its value copyable.
 * Allowed yields an empty overlay; spread it AFTER the input's own attributes.
 */
export type PermissionInputOverlay =
  | Record<string, never>
  | { readOnly: true; title: string; "aria-label": string };

/**
 * Maps a ResolvedDecision to the denial overlay an input composes by spreading
 * it last. Pure — the input-kind counterpart of `permissionProps`.
 */
export function permissionInputProps(
  rd: ResolvedDecision
): PermissionInputOverlay {
  if (rd.allowed) return {};
  return { readOnly: true, title: rd.message, "aria-label": rd.message };
}

/**
 * The denial tooltip copy for a resolved decision: the message when denied,
 * undefined when allowed. For controls that keep their own attributes (spans,
 * inputs already disabled by other state) but still read the copy from the
 * decision rather than embedding their own.
 */
export function denialTooltip(rd: ResolvedDecision): string | undefined {
  return rd.allowed ? undefined : rd.message;
}

/** The four relationship actions a roster row can take against one target. */
export type RosterAction = "remove" | "promote" | "demote" | "transfer";

/**
 * One roster action's control state: `enabled` when its decision allows, else
 * disabled with the decision's denial tooltip copy — so a denied action
 * renders visible-but-disabled instead of vanishing.
 */
export type RosterActionControl =
  | { enabled: true; denial?: never }
  | { enabled: false; denial: string };

/**
 * Bundles a roster row's four relationship decisions against one target into
 * per-action control state. Pure — the row keeps its own onClick, className,
 * and per-action labels; this owns only the enabled/denial wiring.
 */
export function rosterControls(
  decisions: Record<RosterAction, ResolvedDecision>
): Record<RosterAction, RosterActionControl> {
  const toControl = (rd: ResolvedDecision): RosterActionControl =>
    rd.allowed ? { enabled: true } : { enabled: false, denial: rd.message };
  return {
    remove: toControl(decisions.remove),
    promote: toControl(decisions.promote),
    demote: toControl(decisions.demote),
    transfer: toControl(decisions.transfer),
  };
}

/**
 * What both ceremonies share: the actor's role, the owner flags and the
 * relationship decisions. Roles and relationship verbs are the same in a
 * poker room and a retro (ADR-0013).
 */
export interface SharedPermissions {
  role: MemberRole;
  isOwner: boolean;
  isFacilitator: boolean;
  isOwnerAbsent: boolean;
  /** Per-target relationship decisions — the target's role refines the verdict. */
  removeTarget: (targetRole: MemberRole) => ResolvedDecision;
  promoteTarget: (targetRole: MemberRole) => ResolvedDecision;
  demoteTarget: (targetRole: MemberRole) => ResolvedDecision;
  transfer: ResolvedDecision;
  changePermissions: ResolvedDecision;
}

/** The poker arm: the four poker category decisions and the poker shape. */
export interface PokerPermissionsReturn extends SharedPermissions {
  ceremony: "poker";
  /** Per-category resolved decisions. Consumers read `.allowed` / `.message`. */
  revealCards: ResolvedDecision;
  gameFlow: ResolvedDecision;
  issueManagement: ResolvedDecision;
  roomSettings: ResolvedDecision;
  permissions: RoomPermissions;
}

/** The retro arm: the four retro category decisions and the retro shape. */
export interface RetroPermissionsReturn extends SharedPermissions {
  ceremony: "retro";
  stageFlow: ResolvedDecision;
  cardManagement: ResolvedDecision;
  actionManagement: ResolvedDecision;
  retroSettings: ResolvedDecision;
  permissions: RetroPermissions;
}

/**
 * The client permissions computation's result, discriminated on the room's
 * ceremony. Poker consumers narrow via `usePokerPermissions`.
 */
export type UsePermissionsReturn = PokerPermissionsReturn | RetroPermissionsReturn;

/**
 * Decision context for the optimistic-defaults branch (before room data loads):
 * a participant actor with default permissions and no lockdown. Every
 * relationship action is denied for a participant, and routing each verb
 * through `resolve` with this context keeps the denial copy single-sourced —
 * owner-only verbs (transfer/changePerms/demote) read "Only the owner…" and
 * facilitator-level verbs (remove/promote) read "Only facilitators and the
 * owner…", rather than one blanket message standing in for all five.
 */
const OPTIMISTIC_CTX: DecisionContext = {
  actorRole: "participant",
  permissions: DEFAULT_PERMISSIONS,
  ownerAbsent: false,
  ownerInTeam: false,
};

/** The relationship decisions every arm carries, resolved against one context. */
function relationshipDecisions(
  ctx: DecisionContext
): Pick<
  SharedPermissions,
  "removeTarget" | "promoteTarget" | "demoteTarget" | "transfer" | "changePermissions"
> {
  return {
    removeTarget: (targetRole) =>
      resolve({ kind: "relationship", verb: "remove", targetRole }, ctx),
    promoteTarget: (targetRole) =>
      resolve({ kind: "relationship", verb: "promote", targetRole }, ctx),
    demoteTarget: (targetRole) =>
      resolve({ kind: "relationship", verb: "demote", targetRole }, ctx),
    transfer: resolve({ kind: "relationship", verb: "transfer" }, ctx),
    changePermissions: resolve({ kind: "relationship", verb: "changePerms" }, ctx),
  };
}

/**
 * Maps room data to permission resolved decisions through the shared `resolve`
 * combiner. Pure computation — no queries, mutations, React, or duplicated
 * lockdown logic — so it is unit-testable directly without rendering.
 */
export function computePermissions(
  roomData: RoomWithRelatedData | null | undefined,
  currentUserId: Id<"users"> | string | undefined
): UsePermissionsReturn {
  if (!roomData || !currentUserId) {
    // Optimistic defaults before data loads: configurable actions open,
    // relationship actions closed (mirrors prior behaviour).
    // The ceremony is unknown before data loads; poker is the default
    // (undefined roomType), so the optimistic arm is poker.
    return {
      ceremony: "poker",
      role: "participant" as MemberRole,
      isOwner: false,
      isFacilitator: false,
      isOwnerAbsent: false,
      revealCards: RESOLVED_ALLOWED,
      gameFlow: RESOLVED_ALLOWED,
      issueManagement: RESOLVED_ALLOWED,
      roomSettings: RESOLVED_ALLOWED,
      ...relationshipDecisions(OPTIMISTIC_CTX),
      permissions: DEFAULT_PERMISSIONS,
    };
  }

  const currentUser = roomData.users.find((u) => u._id === currentUserId);
  const role: MemberRole = currentUser?.role ?? "participant";
  const effective: EffectivePermissions = getEffectivePermissions(roomData.room);
  const ownerAbsent = roomData.isOwnerAbsent;
  const ctx: DecisionContext = {
    actorRole: role,
    permissions: effective.permissions,
    ownerAbsent,
    ownerInTeam: false,
  };

  const shared: SharedPermissions = {
    role,
    isOwner: role === "owner",
    isFacilitator: role === "facilitator",
    isOwnerAbsent: ownerAbsent,
    ...relationshipDecisions(ctx),
  };

  const category = (c: PermissionCategory, level: PermissionLevel): ResolvedDecision =>
    resolve({ kind: "category", category: c, level }, ctx);

  // Each arm resolves only its own category set (ADR-0013).
  if (effective.ceremony === "retro") {
    const { permissions } = effective;
    return {
      ceremony: "retro",
      ...shared,
      stageFlow: category("stageFlow", permissions.stageFlow),
      cardManagement: category("cardManagement", permissions.cardManagement),
      actionManagement: category("actionManagement", permissions.actionManagement),
      retroSettings: category("retroSettings", permissions.retroSettings),
      permissions,
    };
  }

  const { permissions } = effective;
  return {
    ceremony: "poker",
    ...shared,
    revealCards: category("revealCards", permissions.revealCards),
    gameFlow: category("gameFlow", permissions.gameFlow),
    issueManagement: category("issueManagement", permissions.issueManagement),
    roomSettings: category("roomSettings", permissions.roomSettings),
    permissions,
  };
}

/**
 * The poker consumers' narrowing: the poker arm, or a throw when the room is
 * a retro. A poker surface (the canvas, the settings panel) is never rendered
 * for a retro room, so the throw marks a routing bug rather than a state to
 * handle.
 */
function narrowToPoker(result: UsePermissionsReturn): PokerPermissionsReturn {
  if (result.ceremony !== "poker") {
    throw new Error("Poker permissions requested for a non-poker room");
  }
  return result;
}

/**
 * The retro consumers' narrowing, the mirror of `narrowToPoker`: the retro
 * arm, or a throw when the room is poker. The retro board mounts only under
 * the retro room type, so the throw marks a routing bug.
 */
function narrowToRetro(result: UsePermissionsReturn): RetroPermissionsReturn {
  if (result.ceremony !== "retro") {
    throw new Error("Retro permissions requested for a non-retro room");
  }
  return result;
}

/** `computePermissions` narrowed to the poker arm; see `narrowToPoker`. */
export function computePokerPermissions(
  roomData: RoomWithRelatedData | null | undefined,
  currentUserId: Id<"users"> | string | undefined
): PokerPermissionsReturn {
  return narrowToPoker(computePermissions(roomData, currentUserId));
}

/**
 * Thin `useMemo` wrapper over `computePermissions`, memoized on its inputs so
 * every resolved decision keeps a stable identity across renders until
 * `roomData`/`currentUserId` change — protecting the canvas memoization.
 */
export function usePermissions(
  roomData: RoomWithRelatedData | null | undefined,
  currentUserId: Id<"users"> | string | undefined
): UsePermissionsReturn {
  return useMemo(
    () => computePermissions(roomData, currentUserId),
    [roomData, currentUserId]
  );
}

/**
 * `usePermissions` narrowed to the poker arm for the poker surfaces. Reuses
 * the same memo — narrowing is a type check, not a recompute.
 */
export function usePokerPermissions(
  roomData: RoomWithRelatedData | null | undefined,
  currentUserId: Id<"users"> | string | undefined
): PokerPermissionsReturn {
  return narrowToPoker(usePermissions(roomData, currentUserId));
}

/** `usePermissions` narrowed to the retro arm for the retro surfaces; see `narrowToRetro`. */
export function useRetroPermissions(
  roomData: RoomWithRelatedData | null | undefined,
  currentUserId: Id<"users"> | string | undefined
): RetroPermissionsReturn {
  return narrowToRetro(usePermissions(roomData, currentUserId));
}
