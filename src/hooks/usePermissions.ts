import { useMemo } from "react";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type MemberRole,
  type RoomPermissions,
  type Decision,
  type PermissionCategory,
  DEFAULT_PERMISSIONS,
  getEffectivePermissions,
  evaluate,
} from "@/convex/permissions";

export interface UsePermissionsReturn {
  role: MemberRole;
  isOwner: boolean;
  isFacilitator: boolean;
  isOwnerAbsent: boolean;
  /** Per-category permission decisions. Consumers read `.allowed` / `.reason`. */
  revealCards: Decision;
  gameFlow: Decision;
  issueManagement: Decision;
  roomSettings: Decision;
  /** Per-target relationship decisions — the target's role refines the verdict. */
  removeTarget: (targetRole: MemberRole) => Decision;
  promoteTarget: (targetRole: MemberRole) => Decision;
  demoteTarget: (targetRole: MemberRole) => Decision;
  transfer: Decision;
  changePermissions: Decision;
  permissions: RoomPermissions;
}

const ALLOWED: Decision = { allowed: true };
const DENIED: Decision = { allowed: false, reason: "insufficient-role" };

/**
 * Maps room data to permission Decisions through the shared `evaluate` decision.
 * Pure computation — no queries or mutations, and no duplicated lockdown logic.
 */
export function usePermissions(
  roomData: RoomWithRelatedData | null | undefined,
  currentUserId: Id<"users"> | string | undefined
): UsePermissionsReturn {
  return useMemo(() => {
    if (!roomData || !currentUserId) {
      // Optimistic defaults before data loads: configurable actions open,
      // relationship actions closed (mirrors prior behaviour).
      return {
        role: "participant" as MemberRole,
        isOwner: false,
        isFacilitator: false,
        isOwnerAbsent: false,
        revealCards: ALLOWED,
        gameFlow: ALLOWED,
        issueManagement: ALLOWED,
        roomSettings: ALLOWED,
        removeTarget: () => DENIED,
        promoteTarget: () => DENIED,
        demoteTarget: () => DENIED,
        transfer: DENIED,
        changePermissions: DENIED,
        permissions: DEFAULT_PERMISSIONS,
      };
    }

    const currentUser = roomData.users.find((u) => u._id === currentUserId);
    const role: MemberRole = currentUser?.role ?? "participant";
    const permissions = getEffectivePermissions(roomData.room);
    const ownerAbsent = roomData.isOwnerAbsent;
    const ctx = { actorRole: role, permissions, ownerAbsent };

    const category = (c: PermissionCategory): Decision =>
      evaluate({ kind: "category", category: c, level: permissions[c] }, ctx);

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
        evaluate({ kind: "relationship", verb: "remove", targetRole }, ctx),
      promoteTarget: (targetRole) =>
        evaluate({ kind: "relationship", verb: "promote", targetRole }, ctx),
      demoteTarget: (targetRole) =>
        evaluate({ kind: "relationship", verb: "demote", targetRole }, ctx),
      transfer: evaluate({ kind: "relationship", verb: "transfer" }, ctx),
      changePermissions: evaluate(
        { kind: "relationship", verb: "changePerms" },
        ctx
      ),
      permissions,
    };
  }, [roomData, currentUserId]);
}
