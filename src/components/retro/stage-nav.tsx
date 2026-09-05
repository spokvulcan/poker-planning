"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ResolvedDecision } from "@/convex/permissions";
import { permissionInputProps, permissionProps } from "@/hooks/usePermissions";
import type { StageEntry, Visibility } from "@/convex/model/retroFormats";
import {
  BACK_TO_TEAM,
  BRING_EVERYONE_HERE,
  HIDE_CARDS,
  NEXT_STAGE,
  PREVIOUS_STAGE,
  SHOW_CARDS,
  STAGES_NAV_LABEL,
  STAGE_LABELS,
  TIMEBOX_LABEL,
} from "@/convex/retroCopy";

interface StageNavProps {
  stages: readonly StageEntry[];
  /** The shared pointer. */
  currentStageId: string;
  /** The viewer's own view; null follows the shared pointer. */
  viewStageId: string | null;
  onView: (stageId: string | null) => void;
  /** The stageFlow controls, for an attendee; a Team reader gets the tabs alone. */
  controls?: StageControls;
}

export interface StageControls {
  /** The `stageFlow` decision: denied renders the controls disabled with the copy. */
  stageFlow: ResolvedDecision;
  onAdvance: (toStageId: string) => void;
  onSetCardsVisible: (value: Visibility) => void;
  onSetTimebox: (minutes: number | undefined) => void;
}

/**
 * The stage strip (ADR-0010, spec §7): every entry as a tab. Clicking one
 * moves the viewer's own view, never the shared pointer; "Back to the team"
 * returns it. The stageFlow controls move the shared pointer forward or
 * back, or bring everyone to the viewed entry, and flip the current entry's
 * reveal policy and timebox in place. Nothing here is a lock: a stage
 * projects and defaults, a person moves it.
 */
export function StageNav({
  stages,
  currentStageId,
  viewStageId,
  onView,
  controls,
}: StageNavProps) {
  const sharedIndex = stages.findIndex((stage) => stage.id === currentStageId);
  const current = stages[sharedIndex] ?? stages[0];
  const viewing = viewStageId ?? current.id;
  const viewingShared = viewing === current.id;
  const previous = stages[sharedIndex - 1];
  const next = stages[sharedIndex + 1];
  const deny = controls ? permissionProps(controls.stageFlow) : {};

  return (
    <div
      data-testid="stage-nav"
      className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-1.5 dark:bg-surface-1"
    >
      <div role="tablist" aria-label={STAGES_NAV_LABEL} className="flex flex-wrap items-center gap-1">
        {stages.map((stage) => {
          const selected = stage.id === viewing;
          const shared = stage.id === current.id;
          return (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-shared={String(shared)}
              onClick={() => onView(shared ? null : stage.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-surface-3",
                shared && !selected && "underline underline-offset-4"
              )}
            >
              {STAGE_LABELS[stage.kind]}
            </button>
          );
        })}
      </div>

      {!viewingShared && (
        <Button type="button" variant="outline" size="sm" onClick={() => onView(null)}>
          {BACK_TO_TEAM}
        </Button>
      )}

      {controls && (
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {viewingShared && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={current.cardsVisible === "hidden" ? SHOW_CARDS : HIDE_CARDS}
              onClick={() => controls.onSetCardsVisible(current.cardsVisible === "hidden" ? "visible" : "hidden")}
              {...deny}
            >
              {current.cardsVisible === "hidden" ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              {current.cardsVisible === "hidden" ? SHOW_CARDS : HIDE_CARDS}
            </Button>
            <TimeboxField
              // Remount on a server change so the draft never fights the stored value.
              key={`${current.id}:${current.timeboxMinutes ?? ""}`}
              minutes={current.timeboxMinutes}
              onCommit={controls.onSetTimebox}
              decision={controls.stageFlow}
            />
          </>
        )}
        {!viewingShared && (
          <Button type="button" size="sm" aria-label={BRING_EVERYONE_HERE} onClick={() => controls.onAdvance(viewing)} {...deny}>
            {BRING_EVERYONE_HERE}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={PREVIOUS_STAGE}
          disabled={!previous}
          onClick={() => previous && controls.onAdvance(previous.id)}
          {...deny}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={NEXT_STAGE}
          disabled={!next}
          onClick={() => next && controls.onAdvance(next.id)}
          {...deny}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      )}
    </div>
  );
}

/** The timebox input: commits whole minutes on blur, or clears when emptied. */
function TimeboxField({
  minutes,
  onCommit,
  decision,
}: {
  minutes: number | undefined;
  onCommit: (minutes: number | undefined) => void;
  decision: ResolvedDecision;
}) {
  const [draft, setDraft] = useState(minutes === undefined ? "" : String(minutes));
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (minutes !== undefined) onCommit(undefined);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setDraft(minutes === undefined ? "" : String(minutes));
      return;
    }
    if (parsed !== minutes) onCommit(parsed);
  };
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor="stage-timebox" className="text-xs text-muted-foreground">
        {TIMEBOX_LABEL}
      </Label>
      <Input
        id="stage-timebox"
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        className="h-8 w-16"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        {...permissionInputProps(decision)}
      />
    </div>
  );
}
