"use client";

import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * How a panel sits on the page, and the room its skeleton and its empty line
 * keep for the body to come (`placeholder`, as tall as the chart's own
 * ChartContainer, so the card doesn't jump when the read lands): a chart
 * fills its row's height, a tall chart keeps more room, and a table is as
 * tall as its rows.
 */
const LAYOUTS = {
  chart: {
    card: "flex flex-col h-full shadow-sm",
    content: "flex-1 flex flex-col",
    body: "flex-1 flex flex-col pb-6",
    placeholder: "flex-1 min-h-[200px]",
  },
  tallChart: {
    card: "flex flex-col h-full shadow-sm",
    content: "flex-1 flex flex-col",
    body: "flex-1 flex flex-col pb-6",
    placeholder: "flex-1 min-h-[250px]",
  },
  table: {
    card: "flex flex-col",
    content: "flex-1",
    body: "flex-1",
    placeholder: "h-[250px]",
  },
} as const;

/**
 * The shell of a dashboard panel that draws part of the dashboard's read: a
 * card with the panel's title, its help behind the icon beside the title and
 * a line under it, then one of three states. Until the read lands it shows a
 * skeleton; with nothing to draw it says so; otherwise it shows the panel's
 * body. A panel gives its title, help and line once and draws only its body,
 * so changing its words is one edit, whatever state it is in.
 */
export function DashboardPanel({
  title,
  help,
  description,
  caption,
  captionRow = false,
  layout = "chart",
  isLoading = false,
  isEmpty,
  emptyText,
  children,
}: {
  /** The panel's name, which titles its card. */
  title: string;
  /** What the panel shows and how to read it, behind the help icon. */
  help: string;
  /** The line under the title, until there is something to draw. */
  description: string;
  /**
   * The line once there is, in place of the description: what is drawn, in
   * brief, or how to read it. Without one (null, say, for a trend the read
   * didn't state), the description stays.
   */
  caption?: ReactNode;
  /** Whether the caption's parts sit side by side: a total beside its trend, say. */
  captionRow?: boolean;
  layout?: keyof typeof LAYOUTS;
  isLoading?: boolean;
  /** Whether the read has nothing for this panel to draw yet. */
  isEmpty: boolean;
  /** What the panel says when it has nothing to draw. */
  emptyText: string;
  /** The panel's chart or table, drawn only once there is something to draw. */
  children: ReactNode;
}) {
  const { card, content, body, placeholder } = LAYOUTS[layout];
  const captioned = !isLoading && !isEmpty && caption != null;

  return (
    <Card className={card}>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-1.5">
          {title}
          <TooltipProvider delay={200}>
            <Tooltip>
              <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help shrink-0" />} />
              <TooltipContent className="max-w-[220px] text-center font-normal">
                <p>{help}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription className={cn(captioned && captionRow && "flex items-center gap-2")}>
          {captioned ? caption : description}
        </CardDescription>
      </CardHeader>
      {isLoading ? (
        <CardContent className={content}>
          <div className={`${placeholder} animate-pulse rounded bg-muted`} />
        </CardContent>
      ) : isEmpty ? (
        <CardContent className={content}>
          <div className={`flex ${placeholder} items-center justify-center text-muted-foreground`}>{emptyText}</div>
        </CardContent>
      ) : (
        <CardContent className={body}>{children}</CardContent>
      )}
    </Card>
  );
}
