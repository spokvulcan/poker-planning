import { describe, it, expect } from "vitest";
import { SCALE_VALIDATION, validateCustomScale } from "./scales";

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
