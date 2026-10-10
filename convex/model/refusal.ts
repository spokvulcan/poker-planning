import { ConvexError } from "convex/values";
import type { FieldRule } from "../fieldRule";

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

/**
 * What a person wrote into a text field, as the field's rule keeps it
 * (trimmed, say); refused in the rule's own words when it breaks the rule.
 */
export function requireValid(rule: FieldRule, value: string): string {
  const checked = rule.check(value);
  if (!checked.ok) throw refusal("forbidden", checked.message);
  return checked.value;
}
