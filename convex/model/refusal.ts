import { ConvexError } from "convex/values";
import type { FieldRule } from "../fieldRule";

/**
 * The four refusal codes. Every rule-based refusal in the retro model layer
 * (out of votes, not yours, wrong step, gone), every text field's rule (too
 * long, blank; see requireValid), every denial by the shared guards (not in
 * the room, not allowed) and every act of the other ceremony (ADR-0031) is a
 * ConvexError carrying one, never a plain Error, so the client shows its
 * message as written; a plain Error's message is redacted in production. Its
 * own module so any model file can throw one without an import cycle.
 */
export type RefusalCode = "forbidden" | "budget" | "missing" | "stage";

export type Refusal = { code: RefusalCode; message: string };

export function refusal(code: RefusalCode, message: string): ConvexError<Refusal> {
  return new ConvexError({ code, message });
}

/**
 * The refusal an error carries, or null for any other error: the one reader
 * of a refusal's data, its code and message, on the server, in the browser
 * and in a Next.js route, each of which receives the ConvexError with its
 * data intact. A caller expecting codes of its own (the Jira handshake's)
 * names them.
 */
export function refusalOf<Code extends string = RefusalCode>(
  error: unknown
): { code: Code; message: string } | null {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as Partial<Refusal> | null | undefined;
  return typeof data?.code === "string" && typeof data.message === "string" && data.message
    ? { code: data.code as Code, message: data.message }
    : null;
}

/**
 * What a person wrote into a text field, as the field's rule keeps it
 * (trimmed, say); refused in the rule's own words when it breaks the rule.
 */
export function requireValid(rule: FieldRule, value: string): string {
  const checked = rule.check(value);
  if (!checked.ok) throw refusal("forbidden", checked.message);
  return checked.value;
}
