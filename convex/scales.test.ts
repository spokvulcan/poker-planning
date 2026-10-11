import { describe, it, expect } from "vitest";
import {
  CUSTOM_DECK,
  VOTING_SCALES,
  type VotingScaleType,
  cardNumericValue,
  checkPick,
  deckOf,
  isSpecialCard,
} from "./scales";

const deck = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}`);
const pickCustom = (cards: string[]) => checkPick({ type: "custom", cards });

/** Whether a custom deck, picked, is stored numeric; undefined when it's refused. */
function storedNumeric(cards: string[]): boolean | undefined {
  const checked = pickCustom(cards);
  return checked.ok ? checked.scale.isNumeric : undefined;
}

describe("a creator's pick — the one reading of what a new room deals and stores", () => {
  it("deals the default deck when nothing is picked, and stores it", () => {
    expect(checkPick()).toEqual({
      ok: true,
      cards: VOTING_SCALES.fibonacci.cards,
      scale: { type: "fibonacci", cards: [...VOTING_SCALES.fibonacci.cards], isNumeric: true },
    });
  });

  it.each(["fibonacci", "standard", "tshirt"] as VotingScaleType[])(
    "deals the %s preset's cards and stores the preset",
    (type) => {
      const { cards, isNumeric } = VOTING_SCALES[type];
      expect(checkPick({ type })).toEqual({ ok: true, cards, scale: { type, cards: [...cards], isNumeric } });
    }
  );

  it("deals a preset as it is defined, whatever cards come with it", () => {
    expect(checkPick({ type: "tshirt", cards: ["1", "2", "3"] }).cards).toEqual(VOTING_SCALES.tshirt.cards);
  });

  it("stores a custom deck of numbers as numeric, so its rounds average", () => {
    expect(pickCustom(["1", "2", "3", "5", "8"])).toEqual({
      ok: true,
      cards: ["1", "2", "3", "5", "8"],
      scale: { type: "custom", cards: ["1", "2", "3", "5", "8"], isNumeric: true },
    });
    expect(storedNumeric(["0.5", "1", "1.5"])).toBe(true);
  });

  it("stores numbers with special cards as numeric: ?, ☕ and ∞ estimate nothing", () => {
    expect(storedNumeric(["1", "2", "3", "∞", "?", "☕"])).toBe(true);
  });

  it.each([
    ["words", ["S", "M", "L"]],
    ["numbers and a word", ["1", "2", "Spike"]],
    ["numbers and a literal Infinity", ["1", "2", "Infinity"]],
    ["special cards alone, where nothing reads as a number", ["?", "☕", "∞"]],
  ])("stores a deck of %s as not numeric", (_case, cards) => {
    expect(storedNumeric(cards)).toBe(false);
  });

  it("agrees with each preset: a custom deck of its cards is numeric exactly when it is", () => {
    for (const { cards, isNumeric } of Object.values(VOTING_SCALES)) {
      expect(storedNumeric([...cards])).toBe(isNumeric);
    }
  });

  it("trims each card it deals and stores", () => {
    expect(pickCustom([" 1", "2 ", "  3  ", "Big spike "])).toEqual({
      ok: true,
      cards: ["1", "2", "3", "Big spike"],
      scale: { type: "custom", cards: ["1", "2", "3", "Big spike"], isNumeric: false },
    });
  });

  it("deals the cards of a deck only short of cards, so the page can lay out a deck still being typed", () => {
    expect(pickCustom([" 1", "2"])).toEqual({
      ok: false,
      cards: ["1", "2"],
      rule: "tooFew",
      message: "Add 1 more: a deck needs at least 3 cards.",
    });
  });

  it("deals what it keeps of a deck it refuses a card of, and says why of the first card it refuses", () => {
    expect(pickCustom(["1", "  ", "2", " 2", "x".repeat(CUSTOM_DECK.card.maxLength + 1), "3"])).toEqual({
      ok: false,
      cards: ["1", "2", "3"],
      rule: "card",
      message: "A card can't be blank.",
    });
  });

  describe("refuses a custom deck that breaks a rule, saying which, in the rule's own words", () => {
    it.each([
      ["no cards at all", undefined, { rule: "tooFew", message: "Add 3 more: a deck needs at least 3 cards." }],
      ["fewer than the minimum", ["1", "2"], { rule: "tooFew", message: "Add 1 more: a deck needs at least 3 cards." }],
      ["more than the maximum", deck(CUSTOM_DECK.maxCards + 1), { rule: "tooMany", message: "A deck holds 20 cards at most." }],
      ["a blank card", ["1", "2", "  "], { rule: "card", message: "A card can't be blank." }],
      [
        "a card too long",
        ["1", "2", "x".repeat(CUSTOM_DECK.card.maxLength + 1)],
        { rule: "card", message: "A card fits 10 characters." },
      ],
      ["a card twice", ["1", "2", "2"], { rule: "duplicate", card: "2", message: "2 is already in the deck." }],
      ["two cards equal once trimmed", ["1", "2", " 2 "], { rule: "duplicate", card: "2", message: "2 is already in the deck." }],
      // A card's own rule and a card twice come before the deck's size.
      ["a card twice in a deck short of cards", ["1", "1"], { rule: "duplicate", card: "1", message: "1 is already in the deck." }],
    ] as [string, string[] | undefined, object][])("%s", (_case, cards, broken) => {
      expect(checkPick({ type: "custom", cards })).toMatchObject({ ok: false, ...broken });
    });

    it("keeps a deck at the limits, spaces around a card not counting", () => {
      expect(pickCustom(deck(CUSTOM_DECK.minCards)).ok).toBe(true);
      expect(pickCustom(deck(CUSTOM_DECK.maxCards)).ok).toBe(true);
      expect(pickCustom(["1", "2", ` ${"x".repeat(CUSTOM_DECK.card.maxLength)} `]).ok).toBe(true);
    });
  });
});

describe("the deck — what a room's cards mean", () => {
  it("a room that stores no scale deals the default deck: Fibonacci, numeric", () => {
    const fallback = deckOf(undefined);
    expect(fallback.cards).toEqual([
      "0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "∞", "?", "☕",
    ]);
    expect(fallback.isNumeric).toBe(true);
  });

  it("deals the scale a room stores, and a legal ballot is a card it deals", () => {
    const custom = deckOf({ cards: ["S", "M", "L", "?"], isNumeric: false });
    expect(custom.cards).toEqual(["S", "M", "L", "?"]);
    expect(custom.isNumeric).toBe(false);
    expect(custom.isLegalBallot("M")).toBe(true);
    expect(custom.isLegalBallot("5")).toBe(false); // on the default deck, not this one
    expect(custom.isLegalBallot("m")).toBe(false);
    expect(custom.isLegalBallot("")).toBe(false);
  });

  it("a legacy room keeps what it stored: a custom deck of numbers stored as not numeric stays so", () => {
    expect(deckOf({ cards: ["1", "2", "3"], isNumeric: false }).isNumeric).toBe(false);
  });

  it.each(["∞", "?", "☕"])(
    "the special card %s is dealt and may be played, but estimates nothing",
    (card) => {
      const fallback = deckOf(undefined);
      expect(fallback.cards).toContain(card);
      expect(fallback.isLegalBallot(card)).toBe(true);
      expect(isSpecialCard(card)).toBe(true);
      expect(cardNumericValue(card)).toBeUndefined();
    }
  );

  it("reads a card as its number, and a word or a literal Infinity as none", () => {
    expect(cardNumericValue("5")).toBe(5);
    expect(cardNumericValue("0.5")).toBe(0.5);
    expect(cardNumericValue("1.0")).toBe(1);
    expect(isSpecialCard("XS")).toBe(false);
    expect(cardNumericValue("XS")).toBeUndefined();
    expect(cardNumericValue("")).toBeUndefined();
    // A custom card or a typed final estimate; parsing alone would read Infinity.
    expect(cardNumericValue("Infinity")).toBeUndefined();
    expect(cardNumericValue("-Infinity")).toBeUndefined();
  });
});
