import { describe, it, expect } from "vitest";
import {
  SCALE_VALIDATION,
  cardNumericValue,
  deckOf,
  isSpecialCard,
  validateCustomScale,
} from "./scales";

const deck = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}`);

describe("validateCustomScale — the one custom-scale validator", () => {
  it("accepts a valid deck", () => {
    expect(() => validateCustomScale(["S", "M", "L"])).not.toThrow();
  });

  it("rejects fewer than the minimum cards", () => {
    expect(() => validateCustomScale(["1", "2"])).toThrow(
      `Minimum ${SCALE_VALIDATION.minCards} cards required`
    );
  });

  it("rejects more than the maximum cards", () => {
    expect(() => validateCustomScale(deck(SCALE_VALIDATION.maxCards + 1))).toThrow(
      `Maximum ${SCALE_VALIDATION.maxCards} cards allowed`
    );
  });

  it("rejects duplicate card values", () => {
    expect(() => validateCustomScale(["1", "2", "2"])).toThrow(
      "Duplicate card values not allowed"
    );
  });

  it("rejects empty or blank card values", () => {
    expect(() => validateCustomScale(["1", "2", "  "])).toThrow(
      "Empty card values not allowed"
    );
  });

  it("rejects over-long card values", () => {
    expect(() =>
      validateCustomScale(["1", "2", "x".repeat(SCALE_VALIDATION.maxCardLength + 1)])
    ).toThrow(
      `Card values must be ${SCALE_VALIDATION.maxCardLength} characters or less`
    );
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
