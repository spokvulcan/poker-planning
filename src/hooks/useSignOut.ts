import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

/**
 * The ONE sign-out policy, shared by the two user menus (the room header's
 * UserMenu and the dashboard sidebar's NavUser): an anonymous account's data
 * is deleted on sign-out — permanent accounts keep theirs for when they sign
 * back in — then the auth session is cleared. Failure copy is raised here,
 * once, via toast.
 *
 * Returns a fresh handler each render, so it always closes over the latest
 * anonymity flag — the same semantics the two inlined handlers had.
 */
export function useSignOut(): () => Promise<void> {
  const { isAnonymous } = useAuth();
  const deleteUser = useMutation(api.users.deleteUser);

  return async () => {
    try {
      // Only delete user completely if they are anonymous
      // Non-anonymous users keep their data for when they sign back in
      if (isAnonymous) {
        await deleteUser({});
      }
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
