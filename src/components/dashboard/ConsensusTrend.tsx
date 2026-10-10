"use client";


import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatChartDay } from "./chart-day";

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

function formatSeconds(sec: number): string {
  const minutes = Math.floor(sec / 60);
  const secs = sec % 60;
  if (minutes === 0) return `${secs}s`;
  return `${minutes}m ${secs}s`;
}

export function ConsensusTrend({ data, isLoading }: ConsensusTrendProps) {
  const hasData = data.length > 0;

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

  if (isLoading) {
    return (
      <Card className="flex flex-col h-full shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-1.5">
            Consensus Time Trend
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help shrink-0" />} />
                <TooltipContent className="max-w-[220px] text-center font-normal">
                  <p>Tracks how long it takes to reach consensus over time. A downward trend indicates improving efficiency.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>Average time per issue over sessions</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 min-h-[200px] animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card className="flex flex-col h-full shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-1.5">
            Consensus Time Trend
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help shrink-0" />} />
                <TooltipContent className="max-w-[220px] text-center font-normal">
                  <p>Tracks how long it takes to reach consensus over time. A downward trend indicates improving efficiency.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>Average time per issue over sessions</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex flex-1 min-h-[200px] items-center justify-center text-muted-foreground">
            No timing data yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-1.5">
            Consensus Time Trend
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help shrink-0" />} />
                <TooltipContent className="max-w-[220px] text-center font-normal">
                  <p>Tracks how long it takes to reach consensus over time. A downward trend indicates improving efficiency.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        <CardDescription>Average time per issue over sessions</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pb-6">
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
              tickFormatter={(v) => formatSeconds(v)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => formatChartDay(label as string)}
                  formatter={(value) => [
                    formatSeconds(value as number),
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
      </CardContent>
    </Card>
  );
}
