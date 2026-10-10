import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { PredictabilityData, TimeToConsensusStats, Trend } from "@/convex/analyticsMath";

/**
 * How the dashboard shows a trend verdict from the read (analyticsMath's
 * `Trend`), the one way for every panel that states one: an arrow the way
 * the metric's value went, green for good news and amber for bad (the status
 * tokens, docs/design-tokens.md), and words that state a size only where the
 * read stated one. A direction the read gave no size is said bare ("Slower");
 * a comparison the read didn't make (steady, with no size) says nothing.
 */
export interface TrendView {
  icon: LucideIcon;
  /** The verdict in words; null where the read compared nothing. */
  text: string | null;
  className: string;
}

/** The trend each panel states, as the read hands it over. */
interface TrendOf {
  timeToConsensus: TimeToConsensusStats["trend"];
  agreement: PredictabilityData["agreementTrend"];
  velocity: PredictabilityData["velocityTrend"];
}

/** One way a metric's value went, and how the dashboard says so. */
interface Way {
  /** Whether the value rose: an up arrow, else a down one. */
  rises: boolean;
  /** Whether that is good news. */
  good: boolean;
  /** The verdict with the size the read stated, in whole percent. */
  sized: (pct: number) => string;
  /** The verdict without one. */
  bare: string;
}

/** A metric's words: each way its value can go, and for holding steady. */
interface Wording<T extends Trend<string>> {
  ways: Record<Exclude<T["direction"], "stable">, Way>;
  stable: string;
}

const WORDING: { [Metric in keyof TrendOf]: Wording<TrendOf[Metric]> } = {
  timeToConsensus: {
    ways: {
      faster: { rises: false, good: true, sized: (pct) => `${pct}% faster`, bare: "Faster" },
      slower: { rises: true, good: false, sized: (pct) => `${pct}% slower`, bare: "Slower" },
    },
    stable: "Stable",
  },
  agreement: {
    ways: {
      improving: { rises: true, good: true, sized: (pct) => `Trending up ${pct}%`, bare: "Trending up" },
      declining: { rises: false, good: false, sized: (pct) => `Trending down ${pct}%`, bare: "Trending down" },
    },
    stable: "Stable trend",
  },
  velocity: {
    ways: {
      increasing: { rises: true, good: true, sized: (pct) => `Velocity up ${pct}%`, bare: "Velocity up" },
      decreasing: { rises: false, good: false, sized: (pct) => `Velocity down ${pct}%`, bare: "Velocity down" },
    },
    stable: "Velocity stable",
  },
};

/** A metric's trend verdict as a panel shows it. */
export function trendView<Metric extends keyof TrendOf>(metric: Metric, trend: TrendOf[Metric]): TrendView {
  const { direction, changePct } = trend;
  const { ways, stable }: Wording<Trend<string>> = WORDING[metric];
  if (direction === "stable") {
    return { icon: Minus, text: changePct === null ? null : stable, className: "text-muted-foreground" };
  }
  const way = ways[direction];
  return {
    icon: way.rises ? TrendingUp : TrendingDown,
    text: changePct === null ? way.bare : way.sized(Math.abs(changePct)),
    className: way.good
      ? "text-green-700 dark:text-status-success-fg"
      : "text-amber-700 dark:text-status-warning-fg",
  };
}
