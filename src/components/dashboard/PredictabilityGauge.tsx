"use client";

import {
  Gauge,
  BarChart3,
  Handshake,
  Activity,
  Info,
} from "lucide-react";
import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PredictabilityData } from "@/convex/analyticsMath";
import { trendView } from "./trend-view";

interface PredictabilityGaugeProps {
  score: number | null;
  averageVelocityPerSession: number;
  velocityTrend: PredictabilityData["velocityTrend"];
  averageAgreement: number;
  agreementTrend: PredictabilityData["agreementTrend"];
  isLoading?: boolean;
}

const chartConfig = {
  score: {
    label: "Score",
  },
} satisfies ChartConfig;

function getScoreLabel(score: number): string {
  if (score <= 40) return "Needs Improvement";
  if (score <= 70) return "Getting There";
  return "Healthy";
}

function getScoreColorClass(score: number): string {
  if (score <= 40) return "text-red-600 dark:text-red-400";
  if (score <= 70) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

export function PredictabilityGauge({
  score,
  averageVelocityPerSession,
  velocityTrend,
  averageAgreement,
  agreementTrend,
  isLoading,
}: PredictabilityGaugeProps) {
  if (isLoading) {
    return (
      <Card className="flex flex-col h-full shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold">Predictability Score</CardTitle>
          <CardDescription>
            Estimation consistency across sessions
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pb-4 pt-4">
          <div className="mx-auto aspect-square max-h-[160px] w-full animate-pulse rounded-full bg-muted" />
        </CardContent>
        <CardFooter className="grid grid-cols-3 gap-3 pt-6 mt-auto pb-6">
          <div className="h-[80px] flex-1 animate-pulse rounded-xl border bg-muted/20" />
          <div className="h-[80px] flex-1 animate-pulse rounded-xl border bg-muted/20" />
          <div className="h-[80px] flex-1 animate-pulse rounded-xl border bg-muted/20" />
        </CardFooter>
      </Card>
    );
  }

  if (score === null) {
    return (
      <Card className="flex flex-col h-full shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold">Predictability Score</CardTitle>
          <CardDescription>
            Estimation consistency across sessions
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pb-4 pt-6">
          <div className="flex mx-auto aspect-square max-h-[160px] w-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Gauge className="h-10 w-10 opacity-50" />
            <p className="font-medium text-foreground">Not enough data</p>
            <p className="text-sm text-center">
              Need at least 3 sessions with story points
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Ensure color resembles the dark ring in the provided image
  const color = "var(--chart-1)"; 
  const data = [{ name: "score", value: score, fill: color }];

  // The read's verdicts, as arrows beside the averages.
  const velocity = trendView("velocity", velocityTrend);
  const agreement = trendView("agreement", agreementTrend);
  const VelocityIcon = velocity.icon;
  const AgreementIcon = agreement.icon;

  return (
    <Card className="flex flex-col h-full shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold">Predictability Score</CardTitle>
        <CardDescription>
          Estimation consistency across sessions
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center pb-2 pt-4">
        <div className="flex flex-col items-center gap-2 w-full">
          {/* Gauge */}
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[180px] w-full relative">
            <RadialBarChart
              innerRadius="80%"
              outerRadius="100%"
              data={data}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis
                type="number"
                domain={[0, 100]}
                angleAxisId={0}
                tick={false}
              />
              <RadialBar
                dataKey="value"
                background={{ fill: "var(--surface-3)" }}
                cornerRadius={100}
                angleAxisId={0}
              />
              {/* Center label */}
              <text
                x="50%"
                y="46%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-foreground text-4xl font-bold tracking-tighter"
              >
                {score}
              </text>
              <text
                x="50%"
                y="62%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground text-sm font-medium"
              >
                / 100
              </text>
            </RadialBarChart>
          </ChartContainer>
        </div>
      </CardContent>
      
      <CardFooter className="grid grid-cols-3 gap-3 pt-6 mt-auto pb-6">
        <div className="flex flex-col gap-1.5 rounded-xl border p-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            <span className="text-xs font-medium truncate">Status</span>
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger render={<Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help ml-auto shrink-0" />} />
                <TooltipContent className="max-w-[200px] text-center">
                  <p>Represents the team&apos;s ability to reliably deliver their estimated story points.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center mt-1">
            <span className={`text-base font-bold tracking-tight truncate ${getScoreColorClass(score)}`}>
              {getScoreLabel(score)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border p-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="text-xs font-medium truncate">Avg Velocity</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-lg font-bold tracking-tight text-foreground truncate">
              {averageVelocityPerSession} pts
            </span>
            <VelocityIcon className={`h-3 w-3 stroke-[2.5] shrink-0 ${velocity.className}`} />
          </div>
        </div>
        
        <div className="flex flex-col gap-1.5 rounded-xl border p-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Handshake className="h-3.5 w-3.5" />
            <span className="text-xs font-medium truncate">Avg Agreement</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-lg font-bold tracking-tight text-foreground truncate">
              {averageAgreement}%
            </span>
            <AgreementIcon className={`h-3 w-3 stroke-[2.5] shrink-0 ${agreement.className}`} />
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
