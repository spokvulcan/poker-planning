"use client";

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth, type AuthSnapshot, type WhenAuth } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";
import { generateGuestName } from "@/lib/guest-names";

export const SESSION_FAILED = "Failed to create session. Please try again.";

/** How long the auth state may take to get where the bootstrap needs it before it gives up. */
const CONVEX_AUTH_TIMEOUT_MS = 10_000;

/** The auth state once `ready` holds, or the session message when it doesn't in time. */
function until(whenAuth: WhenAuth, ready: (state: AuthSnapshot) => boolean): Promise<AuthSnapshot> {
  return whenAuth(ready, CONVEX_AUTH_TIMEOUT_MS).catch(() => {
    throw new Error(SESSION_FAILED);
  });
}

export interface EnsureSessionOptions {
  /**
   * Whether a fresh guest gets a users row with a guest name (default true).
   * Joining a room passes false: the join writes the row with the name the
   * person typed.
   */
  createUser?: boolean;
}

/**
 * The session every guest way in goes through: returns the caller's
 * authUserId once Convex has the session, signing in anonymously first when
 * there is none. It waits for the auth provider's first load before deciding
 * (signing in anonymously over a live session is a BetterAuth 400), and a
 * fresh session reaches BetterAuth before Convex, so it waits for Convex to
 * take the token before anything writes. Only then does a fresh guest get
 * its users row, since the server takes no write from a caller it can't
 * identify. The waits are the auth provider's, so they finish even when the
 * page unmounts the caller meanwhile. Throws with a user-facing message on
 * failure.
 */
export function useEnsureSession() {
  const { whenAuth } = useAuth();
  const ensureGlobalUser = useMutation(api.users.ensureGlobalUser);

  return useCallback(
    async ({ createUser = true }: EnsureSessionOptions = {}): Promise<string> => {
      const loaded = await until(whenAuth, (s) => !s.isLoading);

      let sessionUserId = loaded.authUserId;
      const fresh = !sessionUserId;
      if (!sessionUserId) {
        const result = await authClient.signIn.anonymous();
        const newAuthUserId = result.data?.user?.id;
        if (result.error || !newAuthUserId) {
          throw new Error(result.error?.message || SESSION_FAILED);
        }
        sessionUserId = newAuthUserId;
      }

      await until(whenAuth, (s) => s.isAuthenticated);

      if (fresh && createUser) {
        await ensureGlobalUser({ authUserId: sessionUserId, name: generateGuestName() });
      }
      return sessionUserId;
    },
    [whenAuth, ensureGlobalUser]
  );
}
