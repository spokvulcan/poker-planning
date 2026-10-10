"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { createAuthWaiters } from "@/lib/auth-waiters";
import type { Viewer } from "./viewer";

/** The auth state a sign-in waits on. */
export interface AuthSnapshot {
  // BetterAuth's session: a null authUserId means no session only once it has loaded
  authUserId: string | null;
  isSessionPending: boolean;
  // Convex's auth state
  isLoading: boolean;
  isAuthenticated: boolean;
}

/**
 * Resolves with the first auth state `ready` accepts; rejects after
 * `timeoutMs`. Outlives the caller's component.
 */
export type WhenAuth = (ready: (state: AuthSnapshot) => boolean, timeoutMs: number) => Promise<AuthSnapshot>;

export type { SignedInViewer, Viewer } from "./viewer";

/** The viewer, from Convex's auth state and the caller's users row (undefined until it answers). */
function viewerOf(isLoading: boolean, isAuthenticated: boolean, row: Doc<"users"> | null | undefined): Viewer {
  if (isLoading) return { status: "loading" };
  if (!isAuthenticated) return { status: "visitor" };
  if (row === undefined) return { status: "loading" };
  return {
    status: "signedIn",
    name: row?.name ?? null,
    avatarUrl: row?.avatarUrl ?? null,
    email: row?.email ?? null,
    isPermanent: row?.accountType === "permanent",
  };
}

interface AuthContextType {
  // Auth loading state (from Convex - waits for token validation)
  isLoading: boolean;
  // Whether user is authenticated (from Convex - token validated)
  isAuthenticated: boolean;
  // Who is looking, with the name, avatar and kind of account their users row has
  viewer: Viewer;
  // Waits for the auth state to reach a condition (see useEnsureSession)
  whenAuth: WhenAuth;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  viewer: { status: "loading" },
  whenAuth: () => Promise.reject(new Error("No AuthProvider")),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Use Convex's auth state - this waits for token validation
  // Per docs: "Better Auth will reflect an authenticated user before Convex does"
  const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();

  // BetterAuth's session, for the sign-in's waits only: whether there is a session at all
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const authUserId = session?.user?.id;

  const [waiters] = useState(() =>
    createAuthWaiters<AuthSnapshot>({ authUserId: null, isSessionPending: true, isLoading: true, isAuthenticated: false })
  );
  useEffect(() => {
    waiters.update({ authUserId: authUserId ?? null, isSessionPending, isLoading: convexAuthLoading, isAuthenticated });
  }, [waiters, authUserId, isSessionPending, convexAuthLoading, isAuthenticated]);

  // The caller's users row: the app's one subscription to it, read through the viewer
  const globalUser = useQuery(
    api.users.getGlobalUser,
    isAuthenticated ? {} : "skip"
  );

  // Memoize context value to prevent cascading re-renders in consumers
  const value = useMemo(
    () => ({
      isLoading: convexAuthLoading,
      isAuthenticated,
      viewer: viewerOf(convexAuthLoading, isAuthenticated, globalUser),
      whenAuth: waiters.when,
    }),
    [convexAuthLoading, isAuthenticated, globalUser, waiters],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
