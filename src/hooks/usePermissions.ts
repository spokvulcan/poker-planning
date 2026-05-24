import { useMemo } from "react";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type MemberRole,
  type RoomPermissions,
  type ResolvedDecision,
  type PermissionCategory,
  DEFAULT_PERMISSIONS,
  RESOLVED_ALLOWED,
  getEffectivePermissions,
  resolve,
  denialMessage,
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
 * Fixed denied resolved decision for the optimistic-defaults branch's
 * relationship actions (before room data loads). Relationship controls are
 * hidden when denied, so the copy is rarely shown; it derives from
 * `denialMessage` rather than embedding a literal.
 */
const RESOLVED_DENIED: ResolvedDecision = {
  allowed: false,
  message: denialMessage(
    { kind: "relationship", verb: "promote", targetRole: "participant" },
    "insufficient-role"
  ),
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
      removeTarget: () => RESOLVED_DENIED,
      promoteTarget: () => RESOLVED_DENIED,
      demoteTarget: () => RESOLVED_DENIED,
      transfer: RESOLVED_DENIED,
      changePermissions: RESOLVED_DENIED,
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
