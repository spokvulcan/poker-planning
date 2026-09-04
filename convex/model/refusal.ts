import { ConvexError } from "convex/values";

/**
 * The four refusal codes (spec §4.5, ADR-0022). Every rule-based refusal in
 * the retro model layer is a ConvexError carrying one, never a plain Error,
 * so the client can tell a refusal (roll back, toast) from a transient
 * failure (retry). Its own module so any model file can throw one without
 * an import cycle.
 */
export type RefusalCode = "forbidden" | "budget" | "missing" | "stage";

export type Refusal = { code: RefusalCode; message: string };

export function refusal(code: RefusalCode, message: string): ConvexError<Refusal> {
  return new ConvexError({ code, message });
}
