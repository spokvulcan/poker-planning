import type { StickyColor } from "@/convex/retroTemplates";

/**
 * The sticky palette. Like the poker note, a sticky is the one place colour
 * is content rather than state: pastel paper in light mode, a deep tinted
 * sheet in dark mode, with a 2px edge (the card chassis) in the same hue.
 * Full class strings, so Tailwind sees every one of them.
 */
export interface StickyTone {
  /** The sticky's paper and edge. */
  paper: string;
  /** Text on the paper. */
  ink: string;
  /** Secondary text and icons on the paper. */
  muted: string;
  /** Face-down scribbles and hairlines. */
  scribble: string;
  /** A small swatch, for pickers and chips. */
  swatch: string;
  /** Hover wash for buttons on the paper. */
  hover: string;
}

export const STICKY_TONES: Record<StickyColor, StickyTone> = {
  yellow: {
    paper: "bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700",
    ink: "text-amber-950 dark:text-amber-50",
    muted: "text-amber-800/70 dark:text-amber-200/70",
    scribble: "bg-amber-300/80 dark:bg-amber-700/70",
    swatch: "bg-amber-300 dark:bg-amber-500",
    hover: "hover:bg-amber-200/70 dark:hover:bg-amber-800/50",
  },
  green: {
    paper: "bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700",
    ink: "text-emerald-950 dark:text-emerald-50",
    muted: "text-emerald-800/70 dark:text-emerald-200/70",
    scribble: "bg-emerald-300/80 dark:bg-emerald-700/70",
    swatch: "bg-emerald-300 dark:bg-emerald-500",
    hover: "hover:bg-emerald-200/70 dark:hover:bg-emerald-800/50",
  },
  pink: {
    paper: "bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700",
    ink: "text-rose-950 dark:text-rose-50",
    muted: "text-rose-800/70 dark:text-rose-200/70",
    scribble: "bg-rose-300/80 dark:bg-rose-700/70",
    swatch: "bg-rose-300 dark:bg-rose-500",
    hover: "hover:bg-rose-200/70 dark:hover:bg-rose-800/50",
  },
  blue: {
    paper: "bg-sky-100 border-sky-300 dark:bg-sky-900/40 dark:border-sky-700",
    ink: "text-sky-950 dark:text-sky-50",
    muted: "text-sky-800/70 dark:text-sky-200/70",
    scribble: "bg-sky-300/80 dark:bg-sky-700/70",
    swatch: "bg-sky-300 dark:bg-sky-500",
    hover: "hover:bg-sky-200/70 dark:hover:bg-sky-800/50",
  },
  purple: {
    paper: "bg-violet-100 border-violet-300 dark:bg-violet-900/40 dark:border-violet-700",
    ink: "text-violet-950 dark:text-violet-50",
    muted: "text-violet-800/70 dark:text-violet-200/70",
    scribble: "bg-violet-300/80 dark:bg-violet-700/70",
    swatch: "bg-violet-300 dark:bg-violet-500",
    hover: "hover:bg-violet-200/70 dark:hover:bg-violet-800/50",
  },
  orange: {
    paper: "bg-orange-100 border-orange-300 dark:bg-orange-900/40 dark:border-orange-700",
    ink: "text-orange-950 dark:text-orange-50",
    muted: "text-orange-800/70 dark:text-orange-200/70",
    scribble: "bg-orange-300/80 dark:bg-orange-700/70",
    swatch: "bg-orange-300 dark:bg-orange-500",
    hover: "hover:bg-orange-200/70 dark:hover:bg-orange-800/50",
  },
};
