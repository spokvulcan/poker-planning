import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useSignOut } from "@/hooks/useSignOut";
import { toast } from "@/lib/toast";
import { runAct } from "@/lib/run-act";
import { ACCOUNT_DELETED, DELETE_ACCOUNT_FAILED } from "@/convex/accountCopy";

/**
 * Delete account for a permanent account: its own act, the user-deletion
 * mutation (signing out deletes only a guest), then the person is signed out
 * the way the user menus sign out. Content stays behind unnamed, and
 * a retro the account owned passes to whoever joined it first; the auth
 * provider's own record is untouched. A failure says why through runAct (a
 * refusal's message, else a readable line) and signs nothing out, so the
 * person can try again. Returns whether the account is gone.
 */
export function useDeleteAccount(): () => Promise<boolean> {
  const deleteUser = useMutation(api.users.deleteUser);
  const signOut = useSignOut();
  const router = useRouter();

  return async () => {
    if (!(await runAct(deleteUser({}), DELETE_ACCOUNT_FAILED))) return false;
    await signOut();
    toast.success(ACCOUNT_DELETED);
    router.push("/");
    return true;
  };
}
