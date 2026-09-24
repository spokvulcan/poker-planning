import { ConvexError } from "convex/values";

/**
 * The four refusal codes. Every rule-based refusal in the retro model layer
 * (out of votes, not yours, wrong step, gone) is a ConvexError carrying one,
 * never a plain Error, so the client shows its message as written; a plain
 * Error's message is redacted in production. Its own module so any model
 * file can throw one without an import cycle.
 */
export type RefusalCode = "forbidden" | "budget" | "missing" | "stage";

export type Refusal = { code: RefusalCode; message: string };

export function refusal(code: RefusalCode, message: string): ConvexError<Refusal> {
  return new ConvexError({ code, message });
}
