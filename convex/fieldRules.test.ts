import { describe, it, expect } from "vitest";
import type { FieldRule } from "./fieldRule";
import { DISCUSSION_NOTE, ISSUE_TITLE, PERSON_NAME, ROOM_NAME } from "./constants";
import { ACTION_ITEM_TEXT, COLUMN_EMOJI, COLUMN_TITLE, GIF_TITLE, STICKY_TEXT } from "./retroTemplates";

// Every text field's rule, in one table: how long it may be, whether blank
// is refused, whether spaces around it count, and the words a refusal uses.
// The model's writers and the browser's inputs read these same rules.

type Row = {
  field: string;
  rule: FieldRule;
  limit: number;
  /** The refusal for a blank value, or null when blank is kept. */
  blank: string | null;
  tooLong: string;
  /** Whether spaces around a value are dropped. */
  trims: boolean;
};

const ROWS: Row[] = [
  {
    field: "person name",
    rule: PERSON_NAME,
    limit: 50,
    blank: "Name is required",
    tooLong: "Name must be 50 characters or less",
    trims: true,
  },
  {
    field: "room name",
    rule: ROOM_NAME,
    limit: 100,
    blank: "Room name is required",
    tooLong: "Room name must be 100 characters or less",
    trims: true,
  },
  {
    field: "issue title",
    rule: ISSUE_TITLE,
    limit: 500,
    blank: "Issue title is required",
    tooLong: "Issue title must be 500 characters or less",
    trims: true,
  },
  {
    field: "discussion note",
    rule: DISCUSSION_NOTE,
    limit: 10000,
    blank: null,
    tooLong: "Note content too long (max 10000 characters)",
    trims: false,
  },
  {
    field: "column title",
    rule: COLUMN_TITLE,
    limit: 40,
    blank: "A column needs a title.",
    // Not "under 40": a title of exactly 40 is kept.
    tooLong: "Keep column titles to 40 characters.",
    trims: true,
  },
  {
    field: "column emoji",
    rule: COLUMN_EMOJI,
    // Room for a flag or a ZWJ sequence, not for words.
    limit: 16,
    blank: "Pick one emoji.",
    tooLong: "Pick one emoji.",
    trims: true,
  },
  {
    field: "sticky text",
    rule: STICKY_TEXT,
    limit: 500,
    // A GIF can say it all; the sticky itself refuses being empty.
    blank: null,
    tooLong: "Keep stickies to 500 characters.",
    trims: true,
  },
  {
    field: "action item",
    rule: ACTION_ITEM_TEXT,
    limit: 300,
    blank: "An action item needs a few words.",
    tooLong: "Keep action items to 300 characters.",
    trims: true,
  },
  {
    field: "GIF title",
    rule: GIF_TITLE,
    limit: 140,
    // A GIF its source gave no title shows without one.
    blank: null,
    tooLong: "Keep GIF titles to 140 characters.",
    trims: true,
  },
];

describe.each(ROWS)("$field", ({ rule, limit, blank, tooLong, trims }) => {
  it("keeps a value exactly as long as the limit and refuses one longer, in words that agree with it", () => {
    expect(rule.maxLength).toBe(limit);
    expect(rule.check("x".repeat(limit))).toEqual({ ok: true, value: "x".repeat(limit) });
    expect(rule.check("x".repeat(limit + 1))).toEqual({ ok: false, message: tooLong });
  });

  it(trims ? "drops the spaces around a value" : "keeps the spaces around a value", () => {
    const padded = `  ${"x".repeat(limit - 4)}  `;
    expect(rule.check(padded)).toEqual({ ok: true, value: trims ? "x".repeat(limit - 4) : padded });
    // Spaces count toward the limit only where they are kept.
    expect(rule.check(` ${"x".repeat(limit)} `).ok).toBe(trims);
  });

  it(blank ? "refuses a blank value" : "keeps a blank value", () => {
    expect(rule.check("   ")).toEqual(blank ? { ok: false, message: blank } : { ok: true, value: trims ? "" : "   " });
  });

  it("fits a value from outside to the limit instead of refusing it", () => {
    const fitted = rule.fit(`  ${"x".repeat(limit + 10)}  `);
    expect(fitted).toBe(trims ? "x".repeat(limit) : `  ${"x".repeat(limit - 2)}`);
    expect(rule.check(fitted).ok).toBe(true);
  });
});

describe("fitting a value from outside", () => {
  it("never cuts an emoji in half", () => {
    // 🎉 is two UTF-16 units: one that ends on the limit stays, one across it goes whole.
    expect(PERSON_NAME.fit(`${"x".repeat(48)}🎉🎉`)).toBe(`${"x".repeat(48)}🎉`);
    expect(PERSON_NAME.fit(`${"x".repeat(49)}🎉🎉`)).toBe("x".repeat(49));
  });

  it("drops the spaces a cut leaves at the end", () => {
    expect(PERSON_NAME.fit(`${"x".repeat(49)} and the rest`)).toBe("x".repeat(49));
  });
});
