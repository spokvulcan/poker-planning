"use client";

/**
 * PROTOTYPE, throwaway: bits the `/room/new` and `/retro/new` layout variants
 * share. Delete with the variants once a layout wins.
 */

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The grid the create pages already draw behind themselves. */
export function GridBackdrop({ id }: { id: string }) {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full [mask-image:radial-gradient(100%_100%_at_top_center,white,transparent)] stroke-gray-200 dark:stroke-white/10"
        aria-hidden="true"
      >
        <defs>
          <pattern id={id} width={200} height={200} x="50%" y={-1} patternUnits="userSpaceOnUse">
            <path d="M100 200V.5M.5 .5H200" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

/** The whiteboard's dots, for previews that stand in for the board. */
export const BOARD_DOTS =
  "bg-gray-50 bg-[radial-gradient(circle,rgb(0_0_0/0.14)_1px,transparent_1px)] [background-size:20px_20px] dark:bg-neutral-950 dark:bg-[radial-gradient(circle,rgb(255_255_255/0.10)_1px,transparent_1px)]";

/** Planning poker | Retro, keeping the variant across the two pages. */
export function CeremonyTabs({ current, variant }: { current: "poker" | "retro"; variant: string }) {
  const tab = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-full px-4 py-1.5 transition",
      active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    );
  return (
    <nav className="mx-auto flex w-fit rounded-full border bg-muted/60 p-1 text-sm font-medium" aria-label="What to start">
      <Link href={`/room/new?variant=${variant}`} className={tab(current === "poker")} aria-current={current === "poker" ? "page" : undefined}>
        <span aria-hidden="true">🃏</span> Planning poker
      </Link>
      <Link href={`/retro/new?variant=${variant}`} className={tab(current === "retro")} aria-current={current === "retro" ? "page" : undefined}>
        <span aria-hidden="true">🗒️</span> Retro
      </Link>
    </nav>
  );
}

/** A numbered step whose number turns into a tick once it is done. */
export function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
        done ? "bg-emerald-500 text-white dark:bg-emerald-600" : "bg-primary text-primary-foreground"
      )}
    >
      {done ? "✓" : n}
    </span>
  );
}

/**
 * A segmented radio group whose highlight slides to the picked option.
 * Arrow keys, Home and End move the pick; it scrolls sideways when the
 * options outgrow a narrow screen rather than wrapping.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = buttons.current.get(value);
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    buttons.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [value]);

  const onKeyDown = (event: KeyboardEvent) => {
    const at = options.findIndex((o) => o.value === value);
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (at + 1) % options.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (at - 1 + options.length) % options.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : -1;
    if (to < 0) return;
    event.preventDefault();
    onChange(options[to].value);
    // After the render, so an option that mounts an autofocused field
    // doesn't pull keyboard users out of the group.
    requestAnimationFrame(() => buttons.current.get(options[to].value)?.focus());
  };

  return (
    <div className="max-w-full overflow-x-auto rounded-full [scrollbar-width:none]">
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="relative inline-flex rounded-full border bg-muted/60 p-1"
      >
        {pill && (
          <span
            aria-hidden="true"
            className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm ring-1 ring-black/5 transition-[left,width] duration-300 ease-out motion-reduce:transition-none dark:bg-surface-3 dark:ring-white/10"
            style={{ left: pill.left, width: pill.width }}
          />
        )}
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                if (el) buttons.current.set(option.value, el);
                else buttons.current.delete(option.value);
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative z-10 rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                on && !pill && "bg-background shadow-sm dark:bg-surface-3"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
