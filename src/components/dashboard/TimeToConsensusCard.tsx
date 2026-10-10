"use client";

import { Clock, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDuration,
  type TimeToConsensusStats,
} from "@/convex/analyticsMath";

interface TimeToConsensusCardProps {
  averageMs: number | null;
  medianMs: number | null;
  trend: TimeToConsensusStats["trend"];
  isLoading?: boolean;
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        <div className="h-3 w-48 animate-pulse rounded bg-muted mt-2" />
      </CardContent>
    </Card>
  );
}

export function TimeToConsensusCard({
  averageMs,
  medianMs,
  trend,
  isLoading,
}: TimeToConsensusCardProps) {
  if (isLoading) {
    return <CardSkeleton />;
  }

  if (averageMs === null) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Avg Time to Consensus</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">&mdash;</div>
          <p className="text-xs text-muted-foreground mt-1">No timing data yet</p>
        </CardContent>
      </Card>
    );
  }

  // The read's trend: the later sessions against the earlier ones
  let TrendIcon = Minus;
  let trendText = "Stable";
  let trendColor = "text-muted-foreground";

  if (trend.direction === "faster") {
    TrendIcon = TrendingDown;
    trendText =
      trend.changePct === null
        ? "Faster"
        : `${Math.abs(trend.changePct)}% faster`;
    trendColor = "text-green-600 dark:text-green-400";
  } else if (trend.direction === "slower") {
    TrendIcon = TrendingUp;
    trendText =
      trend.changePct === null ? "Slower" : `${trend.changePct}% slower`;
    trendColor = "text-amber-600 dark:text-amber-400";
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Avg Time to Consensus</CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatDuration(averageMs)}</div>
        <div className="flex items-center gap-2 text-xs mt-1">
          <span className={`flex items-center gap-1 ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            {trendText}
          </span>
          {medianMs !== null && (
            <span className="text-muted-foreground">
              — Median: {formatDuration(medianMs)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
