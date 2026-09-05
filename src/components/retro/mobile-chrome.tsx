"use client";

import { useState, type ReactNode } from "react";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { StageKind } from "@/convex/model/retroFormats";
import { ADD_CARD, BOARD_MENU, TEAMLESS_DISCLOSURE, keptByTeam } from "@/convex/retroCopy";
import { StagePill } from "./stage-pill";
import { SelectionBar, type SelectionBarProps } from "./selection-bar";

export interface MobileChromeProps {
  name: string;
  /** The Team that keeps the retro, for the disclosure line; undefined for a teamless one. */
  teamName?: string;
  stageKind: StageKind;
  timeboxMinutes?: number;
  enteredAt?: number;
  /** The tap-selection, for the Group controls; absent for a Team reader. */
  selection?: Omit<SelectionBarProps, "className">;
  /** Opens the composer; absent for a Team reader. */
  onCompose?: () => void;
  /** What the bottom sheet holds: the stage strip, the roster, the menu. */
  children: ReactNode;
}

/**
 * The phone's chrome (spec §10.4, ADR-0011): a full-bleed canvas under one
 * stage pill, one bottom sheet holding everything the desktop header and
 * strip hold, no minimap, and one card-creation button that opens the
 * composer with its prompt picker — the phone's dominant case is async
 * collection, which needs no spatial step. A tap-selection surfaces its
 * Group controls in the same bar.
 */
export function MobileChrome({
  name,
  teamName,
  stageKind,
  timeboxMinutes,
  enteredAt,
  selection,
  onCompose,
  children,
}: MobileChromeProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="pointer-events-none absolute top-3 left-3 z-10">
        <div className="pointer-events-auto">
          <StagePill kind={stageKind} timeboxMinutes={timeboxMinutes} enteredAt={enteredAt} />
        </div>
      </div>
      <div
        data-testid="mobile-bar"
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:bg-surface-1/95"
      >
        {selection && <SelectionBar {...selection} />}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label={BOARD_MENU} onClick={() => setOpen(true)}>
            <Menu className="size-4" />
          </Button>
          {onCompose && (
            <Button type="button" className="flex-1" onClick={onCompose}>
              <Plus className="size-4" />
              {ADD_CARD}
            </Button>
          )}
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" data-testid="board-sheet" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{name}</SheetTitle>
            <SheetDescription>{teamName ? keptByTeam(teamName) : TEAMLESS_DISCLOSURE}</SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}
