"use client";

/**
 * RoomPresenceProvider — one presence subscription per viewer.
 *
 * Previously both always-mounted consumers (CanvasNavigation and
 * RoomSettingsPanel) instantiated `usePresence` themselves: every viewer
 * heartbeated twice and held two presence list subscriptions. This module
 * hoists the single `useRoomPresence` call into a provider mounted by
 * `RoomCanvas` above both consumers; they read the merged roster from context.
 *
 * Re-render isolation (the reason presence was pushed down into the nav in
 * the first place — ReactFlow re-renders are expensive): the provider wraps
 * `RoomCanvasInner` from OUTSIDE, in the `RoomCanvas` component, which does
 * not itself re-render on presence updates. So when a presence tick
 * re-renders this provider, the `RoomCanvasInner` element it received as
 * `children` is reference-identical and React bails out of the whole canvas
 * subtree; only context consumers (the avatar list, the settings roster) are
 * re-rendered by context propagation. The context value identity is also
 * stabilized (`useMemo` over the memoized roster), so unrelated provider
 * re-renders don't fan out either.
 *
 * Demo (ADR-0003): the demo branch lives in `useRoomPresence` — under
 * DemoSimulationProvider it derives all-bots-online locally and never calls
 * `usePresence`, so this provider stays subscription-free there and consumers
 * need no demo branching of their own.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { RoomUserData } from "@/convex/model/users";
import {
  orderUsersByPresence,
  useRoomPresence,
  type UserWithPresence,
} from "@/hooks/useRoomPresence";

interface RoomPresenceContextValue {
  users: UserWithPresence[];
}

const RoomPresenceContext = createContext<RoomPresenceContextValue | null>(
  null,
);

interface RoomPresenceProviderProps {
  roomId: string;
  /** The current user's ID (used for heartbeats; ignored in demo). */
  userId: string;
  users: RoomUserData[];
  children?: ReactNode;
}

export function RoomPresenceProvider({
  roomId,
  userId,
  users,
  children,
}: RoomPresenceProviderProps): ReactNode {
  const usersWithPresence = useRoomPresence(roomId, userId, users);
  const value = useMemo(
    () => ({ users: usersWithPresence }),
    [usersWithPresence],
  );
  return (
    <RoomPresenceContext.Provider value={value}>
      {children}
    </RoomPresenceContext.Provider>
  );
}

/** The merged roster (users + online status), unordered. */
export function useRoomPresenceUsers(): UserWithPresence[] {
  const ctx = useContext(RoomPresenceContext);
  if (!ctx) {
    throw new Error(
      "useRoomPresenceUsers must be used within RoomPresenceProvider",
    );
  }
  return ctx.users;
}

/**
 * The roster with the one ordering rule applied (online-first, joinedAt
 * tiebreak). Pass `currentUserId` for the settings panel's
 * current-user-first variant.
 */
export function usePresenceRoster(currentUserId?: string): UserWithPresence[] {
  const users = useRoomPresenceUsers();
  return useMemo(
    () => orderUsersByPresence(users, currentUserId),
    [users, currentUserId],
  );
}
