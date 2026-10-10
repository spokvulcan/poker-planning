import { toast } from "@/lib/toast";
import { failureCopy } from "@/lib/refusal";

/** A board's words for a write that failed with no refusal of its own. */
export const WRITE_FAILED = "That didn't go through. Try again.";

/** A board's words for a drop whose places didn't save. */
export const MOVE_FAILED = "That move didn't save.";

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
