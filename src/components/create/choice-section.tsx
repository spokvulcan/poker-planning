"use client";

import { useLayoutEffect, useRef, useState, type PointerEventHandler, type ReactNode } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/**
 * The one choice a create page asks for, laid out so that changing it never
 * moves the page: a segmented control whose highlight slides to the pick, a
 * description that keeps its lines, and below them the choice shown on a
 * `Stage` of fixed size.
 *
 * `onChange` says whether the pick came from a pointer, so a choice that
 * opens a field can focus it for a click without pulling a keyboard user
 * out of the control.
 */
export function ChoiceSection<T extends string>({
  id,
  heading,
  choices,
  value,
  onChange,
  description,
  children,
}: {
  id: string;
  heading: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T, byPointer: boolean) => void;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-14 flex flex-col items-center">
      <h2 id={`${id}-heading`} className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {heading}
      </h2>
      <div className="mt-3 max-w-full">
        <SegmentedControl label={heading} choices={choices} value={value} onChange={onChange} />
      </div>
      <p className="mt-3 h-10 text-center text-sm text-balance text-muted-foreground sm:h-5">{description}</p>
      <div className="mt-4 w-full">{children}</div>
    </section>
  );
}

function SegmentedControl<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T, byPointer: boolean) => void;
}) {
  const items = useRef(new Map<T, HTMLElement>());
  // How the last pick was made: a pointer, or keys (Base UI reports it as the hidden input's change).
  const byPointer = useRef(false);
  // Where the highlight sits; until it is measured the picked option paints its own.
  const [highlight, setHighlight] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const item = items.current.get(value);
      if (item) setHighlight({ left: item.offsetLeft, width: item.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    items.current.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [value]);

  return (
    // Too wide for a phone, it scrolls sideways rather than wrapping.
    <div className="max-w-full overflow-x-auto rounded-full [scrollbar-width:none]">
      <RadioGroup
        aria-label={label}
        value={value}
        onPointerDown={() => (byPointer.current = true)}
        onKeyDown={() => (byPointer.current = false)}
        onValueChange={(next) => onChange(next as T, byPointer.current)}
        className="relative inline-flex rounded-full bg-muted/60 p-1 ring-1 ring-foreground/10"
      >
        {highlight && (
          <span
            aria-hidden="true"
            className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm ring-1 ring-black/5 transition-[left,width] duration-300 ease-out motion-reduce:transition-none dark:bg-surface-3 dark:ring-white/10"
            style={{ left: highlight.left, width: highlight.width }}
          />
        )}
        {choices.map((choice) => (
          <Radio.Root
            key={choice.value}
            value={choice.value}
            ref={(item: HTMLElement | null) => {
              if (item) items.current.set(choice.value, item);
              else items.current.delete(choice.value);
            }}
            className={cn(
              "relative z-10 cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-checked:text-foreground",
              !highlight && "data-checked:bg-background data-checked:shadow-sm dark:data-checked:bg-surface-3"
            )}
          >
            {choice.label}
          </Radio.Root>
        ))}
      </RadioGroup>
    </div>
  );
}

/** The whiteboard's dots, so the stage reads as a piece of the board. */
export const BOARD_SURFACE =
  "bg-gray-50 bg-[radial-gradient(circle,rgb(0_0_0/0.14)_1px,transparent_1px)] [background-size:20px_20px] dark:bg-surface-1 dark:bg-[radial-gradient(circle,rgb(255_255_255/0.10)_1px,transparent_1px)]";

export type StageTone = "muted" | "notice" | "error";

/**
 * Where a choice is shown: a frame the caller sizes (it must not resize with
 * the choice), and one line under it for a note and a count.
 */
export function Stage({
  className,
  note,
  tone = "muted",
  count,
  onPointerDown,
  children,
}: {
  className?: string;
  note: ReactNode;
  tone?: StageTone;
  count?: string;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div>
      <div onPointerDown={onPointerDown} className={cn("rounded-2xl ring-1 ring-foreground/10", BOARD_SURFACE, className)}>
        {children}
      </div>
      <div className="mt-2.5 flex h-5 items-center justify-between gap-4 px-1 text-xs">
        <span
          aria-live="polite"
          className={cn(
            "truncate",
            tone === "muted" && "text-muted-foreground",
            tone === "notice" && "text-status-warning-fg",
            tone === "error" && "text-destructive"
          )}
        >
          {note}
        </span>
        {count && <span className="shrink-0 text-muted-foreground tabular-nums">{count}</span>}
      </div>
    </div>
  );
}
