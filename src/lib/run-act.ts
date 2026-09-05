import { toast } from "@/lib/toast";

/**
 * Run one server act and surface a failure as its copy: the refusal's
 * message when the server sent one (spec §4.5), else the caller's fallback.
 * Resolves to whether the act went through, for callers that continue only
 * on success.
 */
export async function runAct(act: Promise<unknown>, fallback: string): Promise<boolean> {
  try {
    await act;
    return true;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : fallback);
    return false;
  }
}
