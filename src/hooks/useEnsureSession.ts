"use client";

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";
import { generateGuestName } from "@/lib/guest-names";

export const SESSION_FAILED = "Failed to create session. Please try again.";

/**
 * The one anonymous-session bootstrap: returns the caller's authUserId,
 * signing in anonymously first when there is no session. With
 * `createGlobalUser`, the fresh guest also gets a users row with a guest
 * name (a creator needs one before the mutation that makes them owner; a
 * joiner's row is written by the join itself). Throws with a user-facing
 * message on failure.
 *
 * Callers must wait for `useAuth().isLoading` to clear before calling:
 * signing in anonymously over a live session is a BetterAuth 400.
 */
export function useEnsureSession() {
  const { authUserId } = useAuth();
  const ensureGlobalUser = useMutation(api.users.ensureGlobalUser);

  return useCallback(
    async (options: { createGlobalUser?: boolean } = {}): Promise<string> => {
      if (authUserId) return authUserId;
      const result = await authClient.signIn.anonymous();
      const newAuthUserId = result.data?.user?.id;
      if (result.error || !newAuthUserId) {
        throw new Error(result.error?.message || SESSION_FAILED);
      }
      if (options.createGlobalUser) {
        await ensureGlobalUser({ authUserId: newAuthUserId, name: generateGuestName() });
      }
      return newAuthUserId;
    },
    [authUserId, ensureGlobalUser]
  );
}
