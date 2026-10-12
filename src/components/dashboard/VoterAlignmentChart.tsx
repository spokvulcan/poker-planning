"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ZAxis,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DashboardPanel } from "./dashboard-panel";

interface ScatterPoint {
  userId: string;
  userName: string;
  x: number; // averageDelta
  y: number; // stdDev
}

interface VoterAlignmentChartProps {
  data: ScatterPoint[];
  isLoading?: boolean;
}

const chartConfig = {
  alignment: {
    label: "Alignment",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function getDotColor(x: number): string {
  const absX = Math.abs(x);
  if (absX <= 0.5) return "var(--status-success-fg)";
  if (absX <= 1.5) return "var(--status-warning-fg)";
  return "var(--status-error-fg)";
}

export function VoterAlignmentChart({
  data,
  isLoading,
}: VoterAlignmentChartProps) {
  // Compute symmetric X domain so 0 is centered
  const xBound = useMemo(() => {
    if (data.length === 0) return 0.5;
    const maxAbs = Math.max(...data.map((p) => Math.abs(p.x)));
    return Math.max(Math.ceil(maxAbs * 4) / 4 + 0.25, 0.5);
  }, [data]);

  return (
    <DashboardPanel
      title="Voter Alignment"
      help="Plots each member by estimation bias and consistency. Center = aligned with consensus."
      description="Estimation bias vs consistency across team members"
      caption="X: avg bias (- under, + over) · Y: variability (stddev)"
      layout="tallChart"
      isLoading={isLoading}
      isEmpty={data.length === 0}
      emptyText="No individual vote data yet"
    >
      <ChartContainer config={chartConfig} className="flex-1 min-h-[250px] w-full aspect-auto">
        <ScatterChart
          accessibilityLayer
          margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            name="Avg Delta"
            domain={[-xBound, xBound]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Variability"
            tickLine={false}
            axisLine={false}
          />
          <ZAxis range={[60, 60]} />
          <ReferenceLine
            x={0}
            stroke="var(--border)"
            strokeDasharray="4 4"
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_label, payload) => {
                  if (payload?.[0]) {
                    const item = payload[0].payload as ScatterPoint;
                    return item.userName;
                  }
                  return "";
                }}
                formatter={(_value, name) => {
                  if (name === "Avg Delta") return [_value, "Avg Bias"];
                  if (name === "Variability")
                    return [_value, "Variability"];
                  return [_value, name];
                }}
              />
            }
          />
          <Scatter data={data} name="alignment">
            {data.map((point) => (
              <Cell key={point.userId} fill={getDotColor(point.x)} />
            ))}
            <LabelList
              dataKey="userName"
              position="top"
              offset={8}
              fontSize={11}
              content={({ x, y, value, offset: labelOffset }) => {
                const name = typeof value === "string" ? value : "";
                const displayName =
                  name.length > 12 ? name.slice(0, 11) + "…" : name;
                return (
                  <text
                    x={Number(x)}
                    y={Number(y) - (Number(labelOffset) || 8)}
                    textAnchor="middle"
                    className="fill-foreground"
                    fontSize={11}
                  >
                    {displayName}
                  </text>
                );
              }}
            />
          </Scatter>
        </ScatterChart>
      </ChartContainer>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "var(--status-success-fg)" }}
          />
          Aligned
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "var(--status-warning-fg)" }}
          />
          Slight bias
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "var(--status-error-fg)" }}
          />
          Significant bias
        </span>
        <span>&middot; Requires numeric scales.</span>
      </div>
    </DashboardPanel>
  );
}
