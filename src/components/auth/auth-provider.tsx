"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/convex/_generated/api";
import { createAuthWaiters } from "@/lib/auth-waiters";
import { browserSessionOf } from "./browser-session";
import { viewerOf, type Viewer } from "./viewer";

/** The auth state a sign-in waits on. */
export interface AuthSnapshot {
  // BetterAuth's session: a null authUserId means no session only once it has
  // loaded, and one the browser couldn't fetch hasn't (browser-session.ts)
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

/**
 * What the auth provider hands out: who is looking, and the sign-in's waits.
 * Convex's own auth state is the provider's to read: a page asks the viewer,
 * and reads as them through useCallerQuery, which waits for Convex to confirm
 * the session (the lint holds pages to this).
 */
interface AuthContextType {
  // Who is looking: their name, avatar, kind of account, and whether Convex has confirmed their session
  viewer: Viewer;
  // Waits for the auth state to reach a condition (see useEnsureSession)
  whenAuth: WhenAuth;
}

const AuthContext = createContext<AuthContextType>({
  viewer: { status: "loading" },
  whenAuth: () => Promise.reject(new Error("No AuthProvider")),
});

export function AuthProvider({
  children,
  initialViewer,
}: {
  children: ReactNode;
  // The viewer the server saw (server-viewer.ts), shown until Convex answers
  initialViewer?: Viewer;
}) {
  // Use Convex's auth state - this waits for token validation, and stays
  // loading while the browser couldn't fetch the session (convex-session.tsx)
  // Per docs: "Better Auth will reflect an authenticated user before Convex does"
  const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();

  // BetterAuth's session, for the sign-in's waits only: whether there is a session at all
  const session = browserSessionOf(authClient.useSession());
  const authUserId = session.status === "live" ? session.authUserId : null;
  const isSessionPending = session.status === "loading" || session.status === "unknown";

  const [waiters] = useState(() =>
    createAuthWaiters<AuthSnapshot>({ authUserId: null, isSessionPending: true, isLoading: true, isAuthenticated: false })
  );
  useEffect(() => {
    waiters.update({ authUserId, isSessionPending, isLoading: convexAuthLoading, isAuthenticated });
  }, [waiters, authUserId, isSessionPending, convexAuthLoading, isAuthenticated]);

  // Who is signed in, as Convex answers: the app's one subscription to it
  const answer = useQuery(api.users.getViewer, isAuthenticated ? {} : "skip");

  const liveViewer = useMemo(
    () => viewerOf({ isLoading: convexAuthLoading, isAuthenticated }, answer),
    [convexAuthLoading, isAuthenticated, answer],
  );
  // Until Convex first answers, the viewer the server saw stands in, so the
  // first paint already draws who is looking; it is confirmed once Convex has
  // authenticated the session, which may be before its answer is in. Once it
  // has answered, Convex alone says, loading included while it checks a
  // session that changed.
  const [hasAnswered, setHasAnswered] = useState(false);
  const answered = hasAnswered || liveViewer.status !== "loading";
  if (answered && !hasAnswered) setHasAnswered(true);
  const viewer = useMemo(() => {
    if (answered || !initialViewer) return liveViewer;
    return initialViewer.status === "signedIn" ? { ...initialViewer, confirmed: isAuthenticated } : initialViewer;
  }, [answered, initialViewer, liveViewer, isAuthenticated]);

  // Memoize context value to prevent cascading re-renders in consumers
  const value = useMemo(() => ({ viewer, whenAuth: waiters.when }), [viewer, waiters]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthContextType => useContext(AuthContext);
