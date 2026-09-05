"use client";

import { cn } from "@/lib/utils";
import type { ActionsRead } from "@/convex/model/retroActions";
import { REVIEW_EMPTY, STAGE_LABELS } from "@/convex/retroCopy";
import { ActionList } from "./action-list";
import type { ActionActions } from "./use-action-actions";

export interface ReviewPanelProps {
  /** `retro.reviewActions`; undefined while loading. */
  read: ActionsRead | undefined;
  /** The writes; absent for a Team reader. */
  actions?: ActionActions;
  className?: string;
}

/**
 * The review stage's foreground (spec §7, §13; ADR-0017): the Team's open
 * action items from earlier retros, oldest first, each naming the retro it
 * came from, with done, drop, edit and reassign in place for whoever may.
 * Nothing is copied; an item has one home. Empty for a teamless retro.
 */
export function ReviewPanel({ read, actions, className }: ReviewPanelProps) {
  return (
    <section
      data-testid="review-panel"
      data-count={read === undefined ? "" : String(read.items.length)}
      aria-label={STAGE_LABELS.review}
      className={cn("flex flex-col gap-3 text-sm", className)}
    >
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{STAGE_LABELS.review}</h2>
      <ActionList read={read} empty={REVIEW_EMPTY} showRoom actions={actions} testId="review-list" />
    </section>
  );
}
