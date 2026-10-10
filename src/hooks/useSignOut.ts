import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

/**
 * The ONE sign-out, shared by the two user menus (the room header's UserMenu
 * and the dashboard sidebar's NavUser): the server signs the caller out first,
 * while the session still says who they are, then the auth session is
 * cleared. The server decides what goes from the session itself: a guest's
 * account is deleted, a permanent account kept for when they sign back in
 * (users.signOut). This browser never decides, so a session still loading
 * can't change the outcome. Failure copy is raised here, once, via toast.
 */
export function useSignOut(): () => Promise<void> {
  const signOutOnServer = useMutation(api.users.signOut);

  return async () => {
    try {
      await signOutOnServer({});
      // Sign out from auth (clears session cookie)
      const result = await authClient.signOut();
      if (result.error) {
        toast.error(
          result.error.message || "Failed to sign out. Please try again.",
        );
      }
    } catch {
      toast.error("Failed to sign out. Please try again.");
    }
  };
}
