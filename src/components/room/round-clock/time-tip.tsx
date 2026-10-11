"use client";

import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clockText } from "@/convex/roundTime";

/** A stretch of time on a bar that says what it was, and how long, on hover. */
export function TimeTip({
  content,
  className,
  style,
  children,
}: {
  content: ReactNode;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger render={<div className={className} style={style} />}>{children}</TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}

/** A tooltip line: what the stretch was, then its length in clock digits. */
export function TimeLine({ label, ms }: { label: string; ms: number }): ReactElement {
  return (
    <span className="flex items-baseline gap-2">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{clockText(ms)}</span>
    </span>
  );
}
