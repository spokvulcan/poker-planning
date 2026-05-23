"use client";

import { useMemo } from "react";
import usePresence from "@convex-dev/presence/react";
import type { RoomUserData } from "@/convex/model/users";
import { api } from "@/convex/_generated/api";
import { useDemoSimulation } from "@/components/room/demo/DemoSimulationProvider";

export interface UserWithPresence extends RoomUserData {
  isOnline: boolean;
  lastSeen: number | null; // Timestamp when user was last online (null if currently online)
}

/**
 * Hook that combines room user data with presence information.
 * Returns users with their online status and last seen timestamp.
 *
 * @param roomId - The room identifier
 * @param userId - The current user's ID (used for heartbeats)
 * @param users - The room users from roomData
 * @returns Array of users with isOnline status and lastSeen timestamp
 */
export function useRoomPresence(
  roomId: string,
  userId: string,
  users: RoomUserData[],
): UserWithPresence[] {
  const demo = useDemoSimulation();

  // Zero-reads (ADR-0003): the Demo must open NO presence subscription, and
  // `usePresence` has no "skip" option (unlike `useQuery`) — so the only way to
  // not subscribe is to not call it. Hence the conditional hook + lint-disable.
  // This does not actually risk the Rules-of-Hooks invariant: `demo` is the
  // presence of a context provider, which is structurally fixed for a component
  // instance (a mount is either under DemoSimulationProvider for its whole life
  // or never), so the branch — and thus the hook-call order — can never change
  // between renders, including under StrictMode/concurrent re-renders. The
  // zero-reads guard test backstops this by asserting `usePresence` is never
  // called in demo mode. Centralizing here covers every caller
  // (canvas-navigation, room-settings-panel) at once.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return demo ? useDemoPresence(users) : useConvexPresence(roomId, userId, users);
}

/** Demo: all bots are shown online, derived locally — no subscription. */
function useDemoPresence(users: RoomUserData[]): UserWithPresence[] {
  return useMemo(
    () => users.map((user) => ({ ...user, isOnline: true, lastSeen: null })),
    [users],
  );
}

/** Real rooms: subscribe to presence and merge it with the user data. */
function useConvexPresence(
  roomId: string,
  userId: string,
  users: RoomUserData[],
): UserWithPresence[] {
  // Subscribe to presence updates for this room
  const presenceState = usePresence(api.presence, roomId, userId);

  // Merge presence data with user data
  return useMemo(() => {
    if (!presenceState) {
      // While loading, show all users as offline with no last seen
      return users.map((user) => ({
        ...user,
        isOnline: false,
        lastSeen: null,
      }));
    }

    // Create a map of presence data by userId
    const presenceByUserId = new Map(presenceState.map((p) => [p.userId, p]));

    return users.map((user) => {
      const presence = presenceByUserId.get(user._id);
      return {
        ...user,
        isOnline: presence?.online ?? false,
        lastSeen: presence?.online ? null : (presence?.lastDisconnected ?? null),
      };
    });
  }, [users, presenceState]);
}
