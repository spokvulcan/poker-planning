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
