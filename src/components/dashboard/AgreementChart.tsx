"use client";

import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { AgreementChartData } from "@/convex/analyticsMath";
import { formatChartDay } from "./chart-day";
import { DashboardPanel } from "./dashboard-panel";
import { trendView } from "./trend-view";

interface AgreementDataPoint {
  date: string;
  timestamp: number;
  agreement: number;
  issueTitle: string;
  roomName: string;
}

interface AgreementChartProps {
  data: AgreementDataPoint[];
  trend: AgreementChartData["trend"];
  isLoading?: boolean;
}

const chartConfig = {
  agreement: {
    label: "Agreement",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

// Group data by date and calculate average
function aggregateByDate(
  data: AgreementDataPoint[]
): Array<{ date: string; agreement: number; count: number }> {
  const byDate: Record<string, { total: number; count: number }> = {};

  for (const point of data) {
    if (!byDate[point.date]) {
      byDate[point.date] = { total: 0, count: 0 };
    }
    byDate[point.date].total += point.agreement;
    byDate[point.date].count += 1;
  }

  return Object.entries(byDate)
    .map(([date, { total, count }]) => ({
      date,
      agreement: Math.round(total / count),
      count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function AgreementChart({ data, trend, isLoading }: AgreementChartProps) {
  const aggregated = aggregateByDate(data);

  return (
    <DashboardPanel
      title="Agreement Trend"
      // What each point is (convex/summarize.ts): an issue's agreement, the
      // share of counted votes on its consensus at the reveal that completed
      // it, which the board shows as "Agree". Not first votes.
      help="The board's Agree figure for each issue: the share of votes on the most common card at the reveal that settled it, averaged by day."
      description="Team alignment over time"
      // The read's agreement trend in words; none when it compared nothing.
      caption={trendView("agreement", trend).text}
      isLoading={isLoading}
      isEmpty={aggregated.length === 0}
      emptyText="No voting data yet"
    >
      <ChartContainer config={chartConfig} className="flex-1 min-h-[200px] w-full aspect-auto">
        <AreaChart
          accessibilityLayer
          data={aggregated}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="fillAgreement" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-agreement)"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="var(--color-agreement)"
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
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => formatChartDay(label as string)}
                formatter={(value) => [`${value}%`, "Agreement"]}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="agreement"
            stroke="var(--color-agreement)"
            fill="url(#fillAgreement)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </DashboardPanel>
  );
}
