import { useMemo } from "react";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type MemberRole,
  type RoomPermissions,
  type ResolvedDecision,
  type PermissionCategory,
  type DecisionContext,
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

export interface UsePermissionsReturn {
  role: MemberRole;
  isOwner: boolean;
  isFacilitator: boolean;
  isOwnerAbsent: boolean;
  /** Per-category resolved decisions. Consumers read `.allowed` / `.message`. */
  revealCards: ResolvedDecision;
  gameFlow: ResolvedDecision;
  issueManagement: ResolvedDecision;
  roomSettings: ResolvedDecision;
  /** Per-target relationship decisions — the target's role refines the verdict. */
  removeTarget: (targetRole: MemberRole) => ResolvedDecision;
  promoteTarget: (targetRole: MemberRole) => ResolvedDecision;
  demoteTarget: (targetRole: MemberRole) => ResolvedDecision;
  transfer: ResolvedDecision;
  changePermissions: ResolvedDecision;
  permissions: RoomPermissions;
}

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
};

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
    return {
      role: "participant" as MemberRole,
      isOwner: false,
      isFacilitator: false,
      isOwnerAbsent: false,
      revealCards: RESOLVED_ALLOWED,
      gameFlow: RESOLVED_ALLOWED,
      issueManagement: RESOLVED_ALLOWED,
      roomSettings: RESOLVED_ALLOWED,
      removeTarget: (targetRole) =>
        resolve({ kind: "relationship", verb: "remove", targetRole }, OPTIMISTIC_CTX),
      promoteTarget: (targetRole) =>
        resolve({ kind: "relationship", verb: "promote", targetRole }, OPTIMISTIC_CTX),
      demoteTarget: (targetRole) =>
        resolve({ kind: "relationship", verb: "demote", targetRole }, OPTIMISTIC_CTX),
      transfer: resolve({ kind: "relationship", verb: "transfer" }, OPTIMISTIC_CTX),
      changePermissions: resolve(
        { kind: "relationship", verb: "changePerms" },
        OPTIMISTIC_CTX
      ),
      permissions: DEFAULT_PERMISSIONS,
    };
  }

  const currentUser = roomData.users.find((u) => u._id === currentUserId);
  const role: MemberRole = currentUser?.role ?? "participant";
  const permissions = getEffectivePermissions(roomData.room);
  const ownerAbsent = roomData.isOwnerAbsent;
  const ctx = { actorRole: role, permissions, ownerAbsent };

  const category = (c: PermissionCategory): ResolvedDecision =>
    resolve({ kind: "category", category: c, level: permissions[c] }, ctx);

  return {
    role,
    isOwner: role === "owner",
    isFacilitator: role === "facilitator",
    isOwnerAbsent: ownerAbsent,
    revealCards: category("revealCards"),
    gameFlow: category("gameFlow"),
    issueManagement: category("issueManagement"),
    roomSettings: category("roomSettings"),
    removeTarget: (targetRole) =>
      resolve({ kind: "relationship", verb: "remove", targetRole }, ctx),
    promoteTarget: (targetRole) =>
      resolve({ kind: "relationship", verb: "promote", targetRole }, ctx),
    demoteTarget: (targetRole) =>
      resolve({ kind: "relationship", verb: "demote", targetRole }, ctx),
    transfer: resolve({ kind: "relationship", verb: "transfer" }, ctx),
    changePermissions: resolve(
      { kind: "relationship", verb: "changePerms" },
      ctx
    ),
    permissions,
  };
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
