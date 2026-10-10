/**
 * trendView: the one way the dashboard shows a trend verdict from the read
 * (analyticsMath's Trend), in every panel that states one. An arrow the way
 * the metric's value went, green for good news and amber for bad, and words
 * that state a size only where the read stated one: a direction the read
 * gave no size is said bare, and a comparison it didn't make says nothing.
 */
import { describe, it, expect } from "vitest";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { trendView } from "./trend-view";

const GOOD = "text-green-700 dark:text-status-success-fg";
const BAD = "text-amber-700 dark:text-status-warning-fg";
const STEADY = "text-muted-foreground";

describe("trendView", () => {
  it("states the size the read stated, in the metric's words", () => {
    expect(trendView("timeToConsensus", { direction: "faster", changePct: -25 })).toEqual({
      icon: TrendingDown,
      text: "25% faster",
      className: GOOD,
    });
    expect(trendView("agreement", { direction: "declining", changePct: -12 })).toEqual({
      icon: TrendingDown,
      text: "Trending down 12%",
      className: BAD,
    });
    expect(trendView("velocity", { direction: "increasing", changePct: 20 })).toEqual({
      icon: TrendingUp,
      text: "Velocity up 20%",
      className: GOOD,
    });
  });

  it("says a direction the read gave no size bare, in every metric", () => {
    expect(trendView("timeToConsensus", { direction: "slower", changePct: null })).toEqual({
      icon: TrendingUp,
      text: "Slower",
      className: BAD,
    });
    expect(trendView("agreement", { direction: "improving", changePct: null }).text).toBe("Trending up");
    expect(trendView("velocity", { direction: "decreasing", changePct: null }).text).toBe("Velocity down");
  });

  it("says nothing for a comparison the read didn't make", () => {
    for (const metric of ["timeToConsensus", "agreement", "velocity"] as const) {
      expect(trendView(metric, { direction: "stable", changePct: null })).toEqual({
        icon: Minus,
        text: null,
        className: STEADY,
      });
    }
  });

  it("says steady where the read compared and found it so", () => {
    expect(trendView("timeToConsensus", { direction: "stable", changePct: 4 }).text).toBe("Stable");
    expect(trendView("agreement", { direction: "stable", changePct: -2 }).text).toBe("Stable trend");
    expect(trendView("velocity", { direction: "stable", changePct: 0 }).text).toBe("Velocity stable");
  });
});
