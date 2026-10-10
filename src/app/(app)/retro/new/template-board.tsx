"use client";

import { Stage } from "@/components/create/choice-section";
import { STICKY_TONES } from "@/components/retro/sticky-colors";
import type { RetroTemplate, StickyColor } from "@/convex/retroTemplates";
import { cn } from "@/lib/utils";

/** How many stickies each column shows, so the preview doesn't look stamped. */
const COLUMN_FILL = [3, 2, 2, 1];

/** A face-down sticky: the board's scribbles on the column's paper. */
function FaceDownSticky({ color }: { color: StickyColor }) {
  const tone = STICKY_TONES[color];
  return (
    <div className={cn("space-y-2 rounded-md border-2 p-3", tone.paper)}>
      <div className={cn("h-1.5 w-4/5 rounded-full", tone.scribble)} />
      <div className={cn("h-1.5 w-3/5 rounded-full", tone.scribble)} />
      <div className={cn("h-1.5 w-2/5 rounded-full", tone.scribble)} />
    </div>
  );
}

/**
 * A template's columns as the board will lay them out, each with a few
 * face-down stickies. The board keeps one height for every template and runs
 * on past its frame; on a phone it scrolls sideways.
 */
export function TemplateBoard({ template }: { template: RetroTemplate }) {
  const count = template.columns.length;
  return (
    <Stage
      className="relative h-[264px] overflow-hidden"
      note="You can rename, add or remove columns on the board."
      count={`${count} columns`}
    >
      <div className="h-full overflow-x-auto [scrollbar-width:none]">
        <div
          key={template.id}
          className="grid h-full gap-3 p-4 sm:p-5"
          style={{ gridTemplateColumns: `repeat(${count}, minmax(7.5rem, 1fr))` }}
        >
          {template.columns.map((column, i) => {
            const tone = STICKY_TONES[column.color];
            return (
              <div
                key={column.title}
                className="flex flex-col gap-2 rounded-xl bg-card/70 p-2.5 ring-1 ring-foreground/10 fill-mode-backwards motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-300"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className={cn("flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-sm font-semibold", tone.paper, tone.ink)}>
                  <span aria-hidden="true">{column.emoji}</span>
                  <span className="truncate">{column.title}</span>
                </div>
                {Array.from({ length: COLUMN_FILL[i % COLUMN_FILL.length] }, (_, k) => (
                  <FaceDownSticky key={k} color={column.color} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-gray-50 to-transparent dark:from-surface-1" />
    </Stage>
  );
}
