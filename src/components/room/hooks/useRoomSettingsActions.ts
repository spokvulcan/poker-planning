"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomPermissions } from "@/convex/permissions";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";

/**
 * Every backend write the room-settings panel can trigger, behind one
 * frozen-identity object — the same seam shape as useCanvasActions.
 */
export interface RoomSettingsActions {
  rename: (name: string) => Promise<void>;
  toggleAutoComplete: () => Promise<void>;
  removeUser: (userId: Id<"users">) => Promise<void>;
  promoteFacilitator: (userId: Id<"users">) => Promise<void>;
  demoteFacilitator: (userId: Id<"users">) => Promise<void>;
  transferOwnership: (userId: Id<"users">) => Promise<void>;
  updatePermissions: (permissions: RoomPermissions) => Promise<void>;
}

interface UseRoomSettingsActionsProps {
  roomId: Id<"rooms">;
}

/**
 * Owns the demo-vs-real decision once, at the action seam: inside a demo context
 * every method is a no-op, so "the demo never writes to the backend" (ADR-0003)
 * is one adapter rather than a guard at every control. Unlike useCanvasActions
 * the methods propagate failures instead of swallowing them — the panel owns the
 * failure toast. The single ref-backed stabilizer lives here too (see
 * useCanvasActions for the full rationale): the wrapper is built once and always
 * invokes the latest closure, so method identity never churns.
 */
export function useRoomSettingsActions({
  roomId,
}: UseRoomSettingsActionsProps): RoomSettingsActions {
  const isDemo = useDemoSimulation() !== null;

  const renameMutation = useMutation(api.rooms.rename);
  const toggleAutoCompleteMutation = useMutation(api.rooms.toggleAutoComplete);
  const removeUserMutation = useMutation(api.users.remove);
  const promoteFacilitatorMutation = useMutation(api.roles.promoteFacilitator);
  const demoteFacilitatorMutation = useMutation(api.roles.demoteFacilitator);
  const transferOwnershipMutation = useMutation(api.roles.transferOwnership);
  const updatePermissionsMutation = useMutation(api.roles.updatePermissions);

  // The live implementations, recreated each render so they always close over
  // the latest roomId/mutations — no per-field refs needed.
  const impl: RoomSettingsActions = {
    rename: async (name) => {
      if (isDemo) return;
      await renameMutation({ roomId, name });
    },
    toggleAutoComplete: async () => {
      if (isDemo) return;
      await toggleAutoCompleteMutation({ roomId });
    },
    removeUser: async (userId) => {
      if (isDemo) return;
      await removeUserMutation({ userId, roomId });
    },
    promoteFacilitator: async (userId) => {
      if (isDemo) return;
      await promoteFacilitatorMutation({ roomId, targetUserId: userId });
    },
    demoteFacilitator: async (userId) => {
      if (isDemo) return;
      await demoteFacilitatorMutation({ roomId, targetUserId: userId });
    },
    transferOwnership: async (userId) => {
      if (isDemo) return;
      await transferOwnershipMutation({ roomId, targetUserId: userId });
    },
    updatePermissions: async (permissions) => {
      if (isDemo) return;
      await updatePermissionsMutation({ roomId, permissions });
    },
  };

  // The single stabilizer, identical to useCanvasActions: the ref always points
  // at the latest closures (updated after every commit — no dependency array is
  // intentional), and the wrapper is built once via a lazy `useState`
  // initializer so its methods keep a frozen identity while always invoking the
  // latest closure.
  const implRef = useRef(impl);
  useEffect(() => {
    implRef.current = impl;
  });

  const [stableActions] = useState<RoomSettingsActions>(() => ({
    rename: (name) => implRef.current.rename(name),
    toggleAutoComplete: () => implRef.current.toggleAutoComplete(),
    removeUser: (userId) => implRef.current.removeUser(userId),
    promoteFacilitator: (userId) => implRef.current.promoteFacilitator(userId),
    demoteFacilitator: (userId) => implRef.current.demoteFacilitator(userId),
    transferOwnership: (userId) => implRef.current.transferOwnership(userId),
    updatePermissions: (permissions) =>
      implRef.current.updatePermissions(permissions),
  }));

  return stableActions;
}
