/**
 * What a text field's rule is: how long its value may be, whether a blank
 * one is refused, whether the spaces around it count, and the words a
 * refusal uses. Each field's rule sits beside its limit, in constants.ts or
 * retroTemplates.ts, and the model's writers and the browser's inputs both
 * read it, so a limit and its words are written once. Pure: no IO, no
 * Convex runtime.
 *
 * A value a person wrote is checked: it's kept, or refused in the rule's
 * words (the model throws that as a refusal, an input shows it). A value
 * from outside, such as a sign-in provider's name, a tracker's title or a
 * name the server works out, is fitted instead: trimmed and cut to the limit.
 */

export type FieldCheck = { ok: true; value: string } | { ok: false; message: string };

export interface FieldRule {
  /** The longest value the field keeps, in characters (UTF-16 units, as an input's maxLength counts). */
  readonly maxLength: number;
  /** A value a person wrote: what the field keeps, or why it's refused. */
  check(value: string): FieldCheck;
  /** A value from outside, made to fit rather than refused. Can come back blank. */
  fit(value: string): string;
}

/**
 * `value` cut to at most `length` characters, never between the two halves
 * of a surrogate pair (most emoji): half of one isn't a string Convex stores.
 */
export function cutTo(value: string, length: number): string {
  if (value.length <= length) return value;
  const last = value.charCodeAt(length - 1);
  return value.slice(0, last >= 0xd800 && last <= 0xdbff ? length - 1 : length);
}

/** A text field's rule, from its limit and its refusal's words. */
export function fieldRule(spec: {
  maxLength: number;
  /** The refusal for a value longer than the limit. */
  tooLong: string;
  /** The refusal for a blank value; without it, blank is kept. */
  blank?: string;
  /** Whether the spaces around a value are dropped, and don't count (default: they are). */
  trim?: boolean;
}): FieldRule {
  const { maxLength, tooLong, blank, trim = true } = spec;
  const clean = (value: string) => (trim ? value.trim() : value);
  return Object.freeze({
    maxLength,
    check(value: string): FieldCheck {
      const kept = clean(value);
      if (blank !== undefined && !kept) return { ok: false, message: blank };
      if (kept.length > maxLength) return { ok: false, message: tooLong };
      return { ok: true, value: kept };
    },
    fit(value: string): string {
      return clean(cutTo(clean(value), maxLength));
    },
  });
}
