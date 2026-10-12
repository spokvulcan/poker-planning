"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { PredictabilityData } from "@/convex/analyticsMath";
import { formatChartDay } from "./chart-day";
import { DashboardPanel } from "./dashboard-panel";
import { trendView } from "./trend-view";

interface SessionDataPoint {
  roomName: string;
  date: string;
  estimatedPoints: number;
  issueCount: number;
  averageAgreement: number;
  averageTimeToConsensus: number;
}

interface VelocityTrendProps {
  sessions: SessionDataPoint[];
  velocityTrend: PredictabilityData["velocityTrend"];
  isLoading?: boolean;
}

const chartConfig = {
  estimatedPoints: {
    label: "Story Points",
    color: "var(--chart-3)",
  },
  rollingAvg: {
    label: "Rolling Avg (3)",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function computeRollingAverage(
  data: SessionDataPoint[],
  window: number
): Array<SessionDataPoint & { rollingAvg: number | null }> {
  return data.map((point, i) => {
    if (i < window - 1) {
      return { ...point, rollingAvg: null };
    }
    const windowSlice = data.slice(i - window + 1, i + 1);
    const avg =
      windowSlice.reduce((sum, p) => sum + p.estimatedPoints, 0) / window;
    return { ...point, rollingAvg: Math.round(avg * 10) / 10 };
  });
}

export function VelocityTrend({
  sessions,
  velocityTrend,
  isLoading,
}: VelocityTrendProps) {
  const sessionsWithPoints = sessions.filter((s) => s.estimatedPoints > 0);

  const totalPoints = sessionsWithPoints.reduce(
    (sum, s) => sum + s.estimatedPoints,
    0
  );
  const totalIssues = sessionsWithPoints.reduce(
    (sum, s) => sum + s.issueCount,
    0
  );

  const trend = trendView("velocity", velocityTrend);
  const TrendIcon = trend.icon;

  const chartData = computeRollingAverage(sessionsWithPoints, 3);

  return (
    <DashboardPanel
      title="Velocity Trend"
      help="Story points estimated per session with a rolling average to track estimation capacity."
      description="Story points per session with rolling average"
      caption={
        <>
          <span>
            {totalPoints} points across {totalIssues} issues
          </span>
          {trend.text && (
            <span className={`flex items-center gap-1 ${trend.className}`}>
              <TrendIcon className="h-3 w-3" />
              {trend.text}
            </span>
          )}
        </>
      }
      captionRow
      isLoading={isLoading}
      isEmpty={sessionsWithPoints.length === 0}
      emptyText="No estimation data yet"
    >
      <ChartContainer config={chartConfig} className="flex-1 min-h-[200px] w-full aspect-auto">
        <ComposedChart
          accessibilityLayer
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="fillEstimatedPoints" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-estimatedPoints)"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="var(--color-estimatedPoints)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatChartDay}
            tickMargin={8}
          />
          <YAxis tickLine={false} axisLine={false} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => formatChartDay(label as string)}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="estimatedPoints"
            stroke="var(--color-estimatedPoints)"
            fill="url(#fillEstimatedPoints)"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="rollingAvg"
            stroke="var(--color-rollingAvg)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ChartContainer>
    </DashboardPanel>
  );
}
