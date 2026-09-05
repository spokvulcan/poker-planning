"use client";

import { cn } from "@/lib/utils";
import { VOTE_ANONYMOUS_NOTE, votesLeft } from "@/convex/retroCopy";

export interface VoteBudgetProps {
  left: number;
  budget: number;
  /** An anonymous retro says so in the vote UI (spec §19). */
  anonymous: boolean;
  className?: string;
}

/** The viewer's remaining dots on the current entry (spec §11), shown while it takes any. */
export function VoteBudget({ left, budget, anonymous, className }: VoteBudgetProps) {
  return (
    <div
      data-testid="vote-budget"
      data-left={left}
      className={cn("flex flex-col gap-0.5 text-xs", className)}
    >
      <span className={cn("font-medium tabular-nums", left === 0 && "text-muted-foreground")}>
        {votesLeft(left, budget)}
      </span>
      {anonymous && <span className="text-muted-foreground">{VOTE_ANONYMOUS_NOTE}</span>}
    </div>
  );
}
