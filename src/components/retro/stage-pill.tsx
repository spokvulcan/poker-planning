"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STAGE_LABELS, STAGE_PILL_LABEL } from "@/convex/retroCopy";
import type { StageKind } from "@/convex/model/retroFormats";
import { timeboxReading } from "./timebox";

interface StagePillProps {
  kind: StageKind;
  /** The entry's advisory timebox; the countdown shows only when set. */
  timeboxMinutes?: number;
  /** The instant the shared pointer entered the entry. */
  enteredAt?: number;
}

/** A once-a-second clock, running only while a countdown is shown. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/**
 * The stage pill (spec §7): the one place the board says which stage is
 * shared, with the advisory timebox counting down beside the label. At zero
 * it reads "Timebox over" and nothing else happens.
 */
export function StagePill({ kind, timeboxMinutes, enteredAt }: StagePillProps) {
  const hasTimebox = timeboxMinutes !== undefined && enteredAt !== undefined;
  const now = useNow(hasTimebox);
  const reading = hasTimebox ? timeboxReading(timeboxMinutes, enteredAt, now) : undefined;
  return (
    <Badge
      variant="secondary"
      data-testid="stage-pill"
      data-stage={kind}
      aria-label={`${STAGE_PILL_LABEL}: ${STAGE_LABELS[kind]}`}
      className="h-7 gap-2 px-3 text-sm"
    >
      {STAGE_LABELS[kind]}
      {reading && (
        <span
          data-testid="timebox"
          data-over={String(reading.over)}
          className={cn(
            "tabular-nums",
            reading.over ? "text-red-700 dark:text-status-error-fg" : "text-muted-foreground"
          )}
        >
          {reading.label}
        </span>
      )}
    </Badge>
  );
}
