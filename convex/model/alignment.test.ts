import { describe, it, expect } from "vitest";
import type { Id } from "../_generated/dataModel";
import { cardNumericValue, computeVoterAlignment } from "./alignment";

const u = (id: string) => id as Id<"users">;

const numericScale = {
  type: "fibonacci" as const,
  cards: ["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"],
  isNumeric: true,
};

const tshirtScale = {
  type: "tshirt" as const,
  cards: ["XS", "S", "M", "L", "XL", "?", "☕"],
  isNumeric: false,
};

describe("cardNumericValue — the one card→numeric conversion", () => {
  it("parses numeric labels", () => {
    expect(cardNumericValue("5")).toBe(5);
    expect(cardNumericValue("0.5")).toBe(0.5);
  });

  it("returns undefined for non-numeric labels instead of NaN", () => {
    expect(cardNumericValue("?")).toBeUndefined();
    expect(cardNumericValue("☕")).toBeUndefined();
    expect(cardNumericValue("XS")).toBeUndefined();
  });
});

describe("computeVoterAlignment", () => {
  it("computes deltaSteps as the scale-index distance from consensus", () => {
    const rows = computeVoterAlignment(
      [
        { userId: u("a"), cardLabel: "8" }, // index 5
        { userId: u("b"), cardLabel: "2" }, // index 2
      ],
      "3", // index 3
      numericScale
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      userId: u("a"),
      cardLabel: "8",
      cardValue: 8,
      consensusLabel: "3",
      consensusValue: 3,
      deltaSteps: 2, // voted two steps above consensus
    });
    expect(rows[1].deltaSteps).toBe(-1); // one step below
  });

  it("excludes special cards and voteless rows — no estimate to align", () => {
    const rows = computeVoterAlignment(
      [
        { userId: u("a"), cardLabel: "5" },
        { userId: u("b"), cardLabel: "?" },
        { userId: u("c"), cardLabel: "☕" },
        { userId: u("d") }, // retracted / never voted
      ],
      "5",
      numericScale
    );
    expect(rows.map((r) => r.userId)).toEqual([u("a")]);
  });

  it("skips deltaSteps on non-numeric scales but keeps the snapshot", () => {
    const rows = computeVoterAlignment(
      [{ userId: u("a"), cardLabel: "L" }],
      "M",
      tshirtScale
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cardLabel: "L",
      consensusLabel: "M",
    });
    expect(rows[0].deltaSteps).toBeUndefined();
    expect(rows[0].cardValue).toBeUndefined();
    expect(rows[0].consensusValue).toBeUndefined();
  });

  it("records no consensus fields when the round had no consensus", () => {
    const rows = computeVoterAlignment(
      [{ userId: u("a"), cardLabel: "5" }],
      null,
      numericScale
    );
    expect(rows[0].consensusLabel).toBeUndefined();
    expect(rows[0].consensusValue).toBeUndefined();
    expect(rows[0].deltaSteps).toBeUndefined();
  });

  it("skips deltaSteps when a card is off the scale (deck changed mid-issue)", () => {
    const rows = computeVoterAlignment(
      [{ userId: u("a"), cardLabel: "100" }], // not in the fibonacci deck
      "3",
      numericScale
    );
    expect(rows[0].cardValue).toBe(100);
    expect(rows[0].deltaSteps).toBeUndefined();
  });

  it("works without a scale (legacy rooms): values parse, steps stay undefined", () => {
    const rows = computeVoterAlignment(
      [{ userId: u("a"), cardLabel: "5" }],
      "5",
      undefined
    );
    expect(rows[0]).toMatchObject({ cardValue: 5, consensusLabel: "5", consensusValue: 5 });
    expect(rows[0].deltaSteps).toBeUndefined();
  });
});
