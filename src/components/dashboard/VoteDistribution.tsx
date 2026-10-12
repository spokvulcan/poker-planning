"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DashboardPanel } from "./dashboard-panel";

interface VoteDistributionItem {
  value: string;
  count: number;
  percentage: number;
}

interface VoteDistributionProps {
  data: VoteDistributionItem[];
  isLoading?: boolean;
}

const chartConfig = {
  count: {
    label: "Issues",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function VoteDistribution({ data, isLoading }: VoteDistributionProps) {
  const topValue = data[0]?.value;
  const totalIssues = data.reduce((sum, d) => sum + d.count, 0);

  // Take top 8 values for the chart
  const chartData = data.slice(0, 8);

  return (
    <DashboardPanel
      title="Vote Distribution"
      help="Shows which estimates your team picks most often."
      description="Most common estimates"
      caption={topValue ? `Most common: ${topValue}` : undefined}
      isLoading={isLoading}
      isEmpty={data.length === 0}
      emptyText="No estimates yet"
    >
      <ChartContainer config={chartConfig} className="flex-1 min-h-[200px] w-full aspect-auto">
        <BarChart
          accessibilityLayer
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            dataKey="value"
            type="category"
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, _name, props) => {
                  const item = props.payload as VoteDistributionItem;
                  return [
                    `${value} issues (${item.percentage}%)`,
                    item.value,
                  ];
                }}
              />
            }
          />
          <Bar
            dataKey="count"
            fill="var(--color-count)"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ChartContainer>

      {/* Summary text */}
      <div className="mt-2 text-center text-xs text-muted-foreground">
        {totalIssues} total issues estimated
      </div>
    </DashboardPanel>
  );
}
