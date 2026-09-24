import { ConvexError } from "convex/values";
import type { Refusal, RefusalCode } from "@/convex/model/refusal";

/**
 * The model layer throws `ConvexError({ code, message })` for every
 * rule-based refusal (out of votes, not yours to edit, voting is closed);
 * anything else is a failure. A refusal's message is written for people,
 * so the board shows it as it is.
 */

const REFUSAL_CODES: ReadonlySet<string> = new Set<RefusalCode>([
  "forbidden",
  "budget",
  "missing",
  "stage",
]);

/** The refusal an error carries, or null for any other failure. */
export function refusalOf(error: unknown): Refusal | null {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as Partial<Refusal> | string | undefined;
  if (typeof data !== "object" || data === null) return null;
  if (typeof data.code !== "string" || !REFUSAL_CODES.has(data.code)) return null;
  return { code: data.code as RefusalCode, message: data.message ?? "" };
}

/** The copy a failed write shows: the refusal's reason, or the caller's fallback. */
export function failureCopy(error: unknown, fallback: string): string {
  return refusalOf(error)?.message || fallback;
}
