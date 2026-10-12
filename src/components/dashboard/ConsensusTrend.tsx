"use client";

import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatDuration } from "@/convex/analyticsMath";
import { formatChartDay } from "./chart-day";
import { DashboardPanel } from "./dashboard-panel";

interface TrendDataPoint {
  date: string;
  roomName: string;
  averageMs: number;
}

interface ConsensusTrendProps {
  data: TrendDataPoint[];
  isLoading?: boolean;
}

const chartConfig = {
  averageSec: {
    label: "Avg Time",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function ConsensusTrend({ data, isLoading }: ConsensusTrendProps) {
  // Aggregate by date (average across rooms on same day)
  const byDate: Record<string, { totalMs: number; count: number }> = {};
  for (const point of data) {
    if (!byDate[point.date]) {
      byDate[point.date] = { totalMs: 0, count: 0 };
    }
    byDate[point.date].totalMs += point.averageMs;
    byDate[point.date].count += 1;
  }

  const chartData = Object.entries(byDate)
    .map(([date, { totalMs, count }]) => ({
      date,
      averageSec: Math.round(totalMs / count / 1000),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <DashboardPanel
      title="Consensus Time Trend"
      help="Tracks how long it takes to reach consensus over time. A downward trend indicates improving efficiency."
      description="Average time per issue over sessions"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      emptyText="No timing data yet"
    >
      <ChartContainer config={chartConfig} className="flex-1 min-h-[200px] w-full aspect-auto">
        <AreaChart
          accessibilityLayer
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="fillAverageSec" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-averageSec)"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="var(--color-averageSec)"
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
          <YAxis
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(sec) => formatDuration(sec * 1000)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => formatChartDay(label as string)}
                formatter={(value) => [
                  formatDuration((value as number) * 1000),
                  "Avg Time",
                ]}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="averageSec"
            stroke="var(--color-averageSec)"
            fill="url(#fillAverageSec)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </DashboardPanel>
  );
}
