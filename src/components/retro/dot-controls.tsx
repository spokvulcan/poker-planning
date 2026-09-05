"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADD_DOT, REMOVE_DOT, votesCount } from "@/convex/retroCopy";
import type { TopicDots } from "./dots";

export interface DotControlsProps extends TopicDots {
  /** Place a dot; absent when the topic takes none, which hides the button. */
  onPlace?: () => void;
  /** Take one of the viewer's own dots off; absent when there is nothing to take. */
  onRemove?: () => void;
  className?: string;
}

/**
 * A topic's dots (spec §11, §10.8): the aggregate when the entry shows it,
 * the viewer's own always, and — while the entry takes dots — one button
 * each way. Nothing here decides the budget: the tap goes to the hook,
 * which refuses locally at the cap with the reason.
 */
export function DotControls({ count, mine, onPlace, onRemove, className }: DotControlsProps) {
  if (count === undefined && mine === 0 && !onPlace && !onRemove) return null;
  return (
    <div
      data-testid="dots"
      data-count={count ?? ""}
      data-mine={mine}
      className={cn("nodrag flex items-center gap-1 text-xs", className)}
      // A tap on a dot is a vote, not a selection of the card under it.
      onClick={(e) => e.stopPropagation()}
    >
      {count !== undefined && (
        <span className="rounded-full bg-black/5 px-2 py-0.5 font-medium tabular-nums dark:bg-surface-3">
          {votesCount(count)}
        </span>
      )}
      {mine > 0 && (
        <span
          aria-label={`Your ${votesCount(mine)}`}
          className="flex items-center gap-0.5"
        >
          {Array.from({ length: Math.min(mine, 5) }, (_, i) => (
            <span key={i} className="size-2 rounded-full bg-primary" />
          ))}
          {mine > 5 && <span className="tabular-nums">{mine}</span>}
        </span>
      )}
      {onRemove && (
        <Button type="button" variant="ghost" size="icon-xs" aria-label={REMOVE_DOT} disabled={mine === 0} onClick={onRemove}>
          <Minus className="size-3" />
        </Button>
      )}
      {onPlace && (
        <Button type="button" variant="outline" size="icon-xs" aria-label={ADD_DOT} onClick={onPlace}>
          <Plus className="size-3" />
        </Button>
      )}
    </div>
  );
}
