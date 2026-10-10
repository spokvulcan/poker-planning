"use client";

import { useCallback } from "react";
import { useAuth, type AuthSnapshot, type WhenAuth } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";

export const SESSION_FAILED = "Failed to create session. Please try again.";

/** How long the auth state may take to get where the bootstrap needs it before it gives up. */
const CONVEX_AUTH_TIMEOUT_MS = 10_000;

/** The auth state once `ready` holds, or the session message when it doesn't in time. */
function until(whenAuth: WhenAuth, ready: (state: AuthSnapshot) => boolean): Promise<AuthSnapshot> {
  return whenAuth(ready, CONVEX_AUTH_TIMEOUT_MS).catch(() => {
    throw new Error(SESSION_FAILED);
  });
}

/**
 * The session every guest way in goes through: resolves once Convex has the
 * session, signing in anonymously first when there is none. It decides only
 * once BetterAuth's session and Convex's auth state have both loaded: with
 * the server-rendered token Convex can load first, and signing in
 * anonymously over a live session is a BetterAuth 400 for a guest and a new
 * guest for a permanent account. A fresh session reaches BetterAuth before
 * Convex, so it waits for Convex to take the token: the room write that
 * follows needs a caller the server can identify. It writes nothing itself;
 * that write makes the caller's users row when they have none. The waits are
 * the auth provider's, so they finish even when the page unmounts the caller
 * meanwhile. Throws with a user-facing message on failure.
 */
export function useEnsureSession() {
  const { whenAuth } = useAuth();

  return useCallback(async (): Promise<void> => {
    const loaded = await until(whenAuth, (s) => !s.isSessionPending && !s.isLoading);

    if (!loaded.authUserId) {
      const result = await authClient.signIn.anonymous();
      if (result.error || !result.data?.user?.id) {
        throw new Error(result.error?.message || SESSION_FAILED);
      }
    }

    await until(whenAuth, (s) => s.isAuthenticated);
  }, [whenAuth]);
}
