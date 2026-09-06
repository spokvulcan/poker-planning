import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useSignOut } from "@/hooks/useSignOut";
import { toast } from "@/lib/toast";
import { ACCOUNT_DELETED, DELETE_ACCOUNT_FAILED } from "@/convex/retroCopy";

/**
 * Delete account for a permanent account (spec §15.2, ADR-0019): the same
 * user-deletion mutation sign-out already runs for an anonymous account,
 * then the session is cleared the way the sign-out hook does. Content
 * stays behind unnamed; the auth provider's own record is untouched. A
 * refusal (the last-admin rule) shows the server's copy and signs nothing
 * out, so the person can fix the Team and try again. Returns whether the
 * account is gone.
 */
export function useDeleteAccount(): () => Promise<boolean> {
  const deleteUser = useMutation(api.users.deleteUser);
  const signOut = useSignOut();
  const router = useRouter();

  return async () => {
    try {
      await deleteUser({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : DELETE_ACCOUNT_FAILED);
      return false;
    }
    await signOut();
    toast.success(ACCOUNT_DELETED);
    router.push("/");
    return true;
  };
}
