import { toast } from "@/lib/toast";
import { failureCopy } from "@/lib/refusal";

/**
 * Run one server act and surface a failure as its copy: the refusal's
 * message when the server sent one, else the caller's fallback. Resolves
 * to whether the act went through, for callers that continue only on
 * success.
 */
export async function runAct(act: Promise<unknown>, fallback: string): Promise<boolean> {
  try {
    await act;
    return true;
  } catch (error) {
    toast.error(failureCopy(error, fallback));
    return false;
  }
}
