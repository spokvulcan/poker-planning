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

interface AgreementDataPoint {
  date: string;
  timestamp: number;
  agreement: number;
  issueTitle: string;
  roomName: string;
}

interface AgreementChartProps {
  data: AgreementDataPoint[];
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

export function AgreementChart({ data, isLoading }: AgreementChartProps) {
  const aggregated = aggregateByDate(data);
  const hasData = aggregated.length > 0;

  // Calculate trend
  let trendText = "";
  if (aggregated.length >= 2) {
    const recent = aggregated.slice(-3);
    const earlier = aggregated.slice(0, 3);
    const recentAvg =
      recent.reduce((s, d) => s + d.agreement, 0) / recent.length;
    const earlierAvg =
      earlier.reduce((s, d) => s + d.agreement, 0) / earlier.length;
    const diff = recentAvg - earlierAvg;

    if (Math.abs(diff) >= 5) {
      trendText =
        diff > 0
          ? `Trending up ${Math.round(diff)}%`
          : `Trending down ${Math.round(Math.abs(diff))}%`;
    } else {
      trendText = "Stable trend";
    }
  }

  if (isLoading) {
    return (
      <Card className="flex flex-col h-full shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-1.5">
            Agreement Trend
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help shrink-0" />} />
                <TooltipContent className="max-w-[220px] text-center font-normal">
                  <p>Shows how often your team reaches consensus on the first vote across sessions.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>Team alignment over time</CardDescription>
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
            Agreement Trend
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help shrink-0" />} />
                <TooltipContent className="max-w-[220px] text-center font-normal">
                  <p>Shows how often your team reaches consensus on the first vote across sessions.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>Team alignment over time</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex flex-1 min-h-[200px] items-center justify-center text-muted-foreground">
            No voting data yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-1.5">
            Agreement Trend
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help shrink-0" />} />
                <TooltipContent className="max-w-[220px] text-center font-normal">
                  <p>Shows how often your team reaches consensus on the first vote across sessions.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        <CardDescription>
          {trendText || "Team alignment over time"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pb-6">
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
      </CardContent>
    </Card>
  );
}
