/**
 * Zoom-level derivation (spec §10.2, §21.1): the three levels at both
 * boundaries, the card size per level, and the headline clamp.
 */
import { describe, it, expect } from "vitest";
import { cardSizeAt, headlineOf, zoomLevelOf } from "./zoom";

describe("zoomLevelOf", () => {
  it("is detail above 0.70, headline from 0.35 to 0.70 inclusive, shape below 0.35", () => {
    expect(zoomLevelOf(4)).toBe("detail");
    expect(zoomLevelOf(0.71)).toBe("detail");
    expect(zoomLevelOf(0.7)).toBe("headline");
    expect(zoomLevelOf(0.5)).toBe("headline");
    expect(zoomLevelOf(0.35)).toBe("headline");
    expect(zoomLevelOf(0.349)).toBe("shape");
    expect(zoomLevelOf(0.1)).toBe("shape");
  });
});

describe("cardSizeAt", () => {
  it("fixes the height below detail and leaves it to the text at detail", () => {
    expect(cardSizeAt("detail")).toEqual({ width: 200, height: undefined });
    expect(cardSizeAt("headline")).toEqual({ width: 200, height: 56 });
    expect(cardSizeAt("shape")).toEqual({ width: 200, height: 96 });
  });
});

describe("headlineOf", () => {
  it("takes the first line, trimmed, and clamps a long one with an ellipsis", () => {
    expect(headlineOf("  keep the demo \nsecond line")).toBe("keep the demo");
    expect(headlineOf("x".repeat(80), 10)).toBe("xxxxxxxxx…");
    expect(headlineOf("")).toBe("");
  });
});
