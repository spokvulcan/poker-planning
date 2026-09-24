import { ConvexError } from "convex/values";
import type { Refusal } from "@/convex/model/refusal";

/**
 * The copy a failed write shows. The model layer throws
 * `ConvexError({ code, message })` for every rule-based refusal (out of
 * votes, not yours to edit, voting is closed), and a refusal's message is
 * written for people, so the board shows it as it is; anything else is a
 * failure and shows the caller's fallback.
 */
export function failureCopy(error: unknown, fallback: string): string {
  if (!(error instanceof ConvexError)) return fallback;
  const message = (error.data as Partial<Refusal> | undefined)?.message;
  return typeof message === "string" && message ? message : fallback;
}
