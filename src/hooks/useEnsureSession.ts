"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";
import { generateGuestName } from "@/lib/guest-names";
import { useLatest } from "./use-latest";

export const SESSION_FAILED = "Failed to create session. Please try again.";

/** How long a fresh session may take to reach Convex before the bootstrap gives up. */
const CONVEX_AUTH_TIMEOUT_MS = 10_000;

/** Resolves once Convex is authenticated: at once if it is, else when `waiting` is resumed. */
function convexHasSession(authenticated: RefObject<boolean>, waiting: RefObject<Set<() => void>>): Promise<void> {
  if (authenticated.current) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const resume = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      waiting.current.delete(resume);
      reject(new Error(SESSION_FAILED));
    }, CONVEX_AUTH_TIMEOUT_MS);
    waiting.current.add(resume);
  });
}

/**
 * The session for creating a room or a retro: returns the caller's authUserId
 * once Convex has the session, signing in anonymously first when there is
 * none. A fresh session reaches BetterAuth before Convex, and a mutation that
 * needs an identity sent in between fails as unauthenticated, so this waits
 * for Convex to take the session's token. A fresh guest also gets a users row
 * with a guest name, which a creator needs before the mutation that makes
 * them owner. (Joining signs in on its own: the join carries the session's
 * id and writes the row itself.) Throws with a user-facing message on failure.
 *
 * Callers must wait for `useAuth().isLoading` to clear before calling:
 * signing in anonymously over a live session is a BetterAuth 400.
 */
export function useEnsureSession() {
  const { authUserId, isAuthenticated } = useAuth();
  const ensureGlobalUser = useMutation(api.users.ensureGlobalUser);
  const authenticated = useLatest(isAuthenticated);
  const waiting = useRef(new Set<() => void>());

  // Convex took the token: everyone waiting for it goes on.
  useEffect(() => {
    if (!isAuthenticated) return;
    for (const resume of waiting.current) resume();
    waiting.current.clear();
  }, [isAuthenticated]);

  return useCallback(
    async (): Promise<string> => {
      let sessionUserId = authUserId;
      if (!sessionUserId) {
        const result = await authClient.signIn.anonymous();
        const newAuthUserId = result.data?.user?.id;
        if (result.error || !newAuthUserId) {
          throw new Error(result.error?.message || SESSION_FAILED);
        }
        sessionUserId = newAuthUserId;
        // Runs before Convex has the token: the mutation takes the id instead.
        await ensureGlobalUser({ authUserId: sessionUserId, name: generateGuestName() });
      }
      await convexHasSession(authenticated, waiting);
      return sessionUserId;
    },
    [authUserId, ensureGlobalUser, authenticated]
  );
}
