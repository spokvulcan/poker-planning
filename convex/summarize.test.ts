import { describe, it, expect } from "vitest";
import { summarize } from "./summarize";

const numeric = { isNumeric: true };

describe("summarize — consensus", () => {
  it("returns the most common vote as the consensus", () => {
    const s = summarize(
      [{ cardLabel: "5" }, { cardLabel: "5" }, { cardLabel: "3" }],
      numeric
    );
    expect(s.consensus).toBe("5");
  });

  it("breaks ties toward the lower numeric value", () => {
    // "5" is an integer-like key (JS would order it first); a decimal tie
    // ensures we exercise real tie-break logic, not object key ordering.
    const s = summarize([{ cardLabel: "5" }, { cardLabel: "0.5" }], numeric);
    expect(s.consensus).toBe("0.5");
  });

  it("breaks non-numeric ties alphabetically", () => {
    const s = summarize(
      [{ cardLabel: "M" }, { cardLabel: "L" }],
      { isNumeric: false }
    );
    expect(s.consensus).toBe("L");
  });

  it("returns the real card label on a numeric tie, not a reparsed number", () => {
    // A custom numeric deck can use non-canonical labels like "1.0"/"2.0".
    // The consensus must be an actual card label so it round-trips for
    // display and scale-index lookups — not Math.min(...).toString() ("1").
    const s = summarize([{ cardLabel: "1.0" }, { cardLabel: "2.0" }], numeric);
    expect(s.consensus).toBe("1.0");
  });
});

describe("summarize — stats", () => {
  it("agreement is the share of counted votes on the consensus, excluding special cards", () => {
    // 2×"5", 1×"3", 1×"?" → counted (non-special) = 3, mode "5" count 2 → 67%.
    // The old client counted the "?" too (2/4 = 50%) — that is the divergence.
    const s = summarize(
      [{ cardLabel: "5" }, { cardLabel: "5" }, { cardLabel: "3" }, { cardLabel: "?" }],
      numeric
    );
    expect(s.consensus).toBe("5");
    expect(s.stats.agreement).toBe(67);
    expect(s.stats.voteCount).toBe(3); // special excluded
  });

  it("computes average and median over numeric (non-special) votes", () => {
    const s = summarize(
      [{ cardLabel: "2" }, { cardLabel: "4" }, { cardLabel: "6" }],
      numeric
    );
    expect(s.stats.average).toBe(4);
    expect(s.stats.median).toBe(4);
  });

  it("averages the two middle values for an even count", () => {
    const s = summarize(
      [{ cardLabel: "2" }, { cardLabel: "4" }, { cardLabel: "6" }, { cardLabel: "8" }],
      numeric
    );
    expect(s.stats.median).toBe(5);
  });

  it("omits average/median for a non-numeric scale", () => {
    const s = summarize(
      [{ cardLabel: "M" }, { cardLabel: "M" }, { cardLabel: "L" }],
      { isNumeric: false }
    );
    expect(s.stats.average).toBeNull();
    expect(s.stats.median).toBeNull();
    expect(s.consensus).toBe("M");
    expect(s.stats.agreement).toBe(67);
  });

  it("treats an absent scale as numeric (the default scale is numeric)", () => {
    // A room with no explicit votingScale (the demo room, and rooms predating
    // the field) must still get numeric stats — the client renders them via
    // `votingScale?.isNumeric ?? true`, so the stored stats must agree.
    const s = summarize([{ cardLabel: "2" }, { cardLabel: "4" }, { cardLabel: "6" }]);
    expect(s.stats.average).toBe(4);
    expect(s.stats.median).toBe(4);
  });

  it("returns nulls and zero agreement when there are no countable votes", () => {
    const s = summarize([], numeric);
    expect(s.consensus).toBeNull();
    expect(s.stats).toEqual({
      average: null,
      median: null,
      agreement: 0,
      voteCount: 0,
    });
  });

  it("treats an all-special-card round as empty for stats and consensus", () => {
    const s = summarize([{ cardLabel: "?" }, { cardLabel: "☕" }], numeric);
    expect(s.consensus).toBeNull();
    expect(s.stats.voteCount).toBe(0);
    expect(s.stats.agreement).toBe(0);
  });
});

describe("summarize — distribution", () => {
  it("includes every cast card (specials too), numeric ascending then specials", () => {
    const s = summarize(
      [{ cardLabel: "5" }, { cardLabel: "3" }, { cardLabel: "5" }, { cardLabel: "?" }],
      numeric
    );
    expect(s.distribution).toEqual([
      { label: "3", count: 1 },
      { label: "5", count: 2 },
      { label: "?", count: 1 },
    ]);
  });
});
