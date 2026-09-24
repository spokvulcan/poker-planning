"use client";

import { memo, useRef, useState, type ReactElement } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_COLUMN_TITLE_LENGTH } from "@/convex/retroTemplates";
import { PAD_HEIGHT, PAD_WIDTH } from "@/convex/retroLayout";
import { STICKY_TONES } from "../sticky-colors";
import { stickiesLabel } from "../retro-summary";
import type { PadNodeData } from "../types";

/**
 * A column's sticky pad: the prompt, its emoji and colour, and a stack of
 * blank stickies to peel from. Click it and a new sticky lands at the
 * bottom of the column, ready to type in, the way the voting cards sit
 * ready in the poker room.
 */
export const PadNode = memo(({ data, selected }: NodeProps<Node<PadNodeData, "pad">>): ReactElement => {
  const { column, count, canRename, actions } = data;
  const tone = STICKY_TONES[column.color];
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(column.title);
  // A drag that ends over the pad is not a click on it.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  const finishRename = () => {
    setRenaming(false);
    const next = title.trim();
    if (next && next !== column.title) actions.renameColumn(column.id, next);
    else setTitle(column.title);
  };

  return (
    <div className="group/pad relative" style={{ width: PAD_WIDTH, height: PAD_HEIGHT }} data-testid="retro-pad">
      <Handle type="target" position={Position.Top} id="top" className="bg-gray-400! dark:bg-surface-3!" aria-hidden="true" />
      {/* The blank sheets under the top one */}
      <div aria-hidden="true" className={cn("absolute inset-0 translate-x-2 translate-y-2 rounded-xl border-2 opacity-50", tone.paper)} />
      <div aria-hidden="true" className={cn("absolute inset-0 translate-x-1 translate-y-1 rounded-xl border-2 opacity-80", tone.paper)} />
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => {
          pressedAt.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
          const from = pressedAt.current;
          const moved = from ? Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4 : false;
          if (!renaming && !moved) actions.startDraft(column.id);
        }}
        onKeyDown={(e) => {
          if (!renaming && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            actions.startDraft(column.id);
          }
        }}
        aria-label={`Add a sticky to ${column.title}`}
        className={cn(
          "relative flex h-full w-full cursor-pointer items-center gap-3 rounded-xl border-2 px-4 shadow-md transition-all duration-200 ease-out select-none",
          "hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]",
          tone.paper,
          tone.ink,
          selected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-blue-400 dark:ring-offset-surface-1"
        )}
      >
        <span className="text-3xl leading-none" aria-hidden="true">
          {column.emoji}
        </span>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={title}
              maxLength={MAX_COLUMN_TITLE_LENGTH}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={finishRename}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") finishRename();
                if (e.key === "Escape") {
                  setTitle(column.title);
                  setRenaming(false);
                }
              }}
              aria-label="Column title"
              className="nodrag w-full rounded bg-white/60 px-1 text-base font-semibold outline-none dark:bg-black/30"
            />
          ) : (
            <div className="flex items-center gap-1">
              <span className="truncate text-base font-semibold tracking-tight">{column.title}</span>
              {canRename && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTitle(column.title);
                    setRenaming(true);
                  }}
                  className={cn(
                    "nodrag shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover/pad:opacity-100 focus-visible:opacity-100",
                    tone.muted,
                    tone.hover
                  )}
                  aria-label={`Rename ${column.title}`}
                >
                  <Pencil className="size-3" />
                </button>
              )}
            </div>
          )}
          <div className={cn("text-xs font-medium", tone.muted)}>
            {count === 0 ? "Click to add a sticky" : stickiesLabel(count)}
          </div>
        </div>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/70 shadow-sm transition-transform group-hover/pad:scale-110 dark:bg-black/25"
          )}
          aria-hidden="true"
        >
          <Plus className="size-4" />
        </span>
      </div>
    </div>
  );
});

PadNode.displayName = "PadNode";
