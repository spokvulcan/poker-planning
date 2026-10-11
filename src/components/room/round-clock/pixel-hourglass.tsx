"use client";

import { useEffect, useState, type ReactElement } from "react";
import { cn } from "@/lib/utils";

/**
 * The timebox's sand timer: a pixel-art hourglass drawn as SVG cells, so it
 * stays crisp at any canvas zoom. The pile is a pure function of the share of
 * sand left on top, so everyone looking at a shared timebox sees the same
 * pile at the same moment; only the falling grains move locally. A flip turns
 * the glass over with the sand where it lay, and the new reading takes over.
 */

const W = 15; // columns
const H = 27; // rows: cap, 12 top-bulb rows, the neck, 12 bottom-bulb rows, cap
const MID = 7;
const NECK = 13;
const SAND_TOP_ROW = 3; // a full top bulb leaves its first two rows empty
const TOP_BULB = [6, 6, 6, 6, 6, 5, 5, 4, 3, 2, 1, 0]; // interior half-width, rows 1–12
const HALF = [...TOP_BULB, 0, ...[...TOP_BULB].reverse()]; // rows 1–25

type Cell = readonly [x: number, y: number];

const GLASS: Cell[] = [];
const TOP_SAND: Cell[] = [];
const BOTTOM: Cell[] = [];
for (let y = 1; y <= H - 2; y++) {
  const h = HALF[y - 1];
  GLASS.push([MID - h - 1, y], [MID + h + 1, y]);
  for (let x = MID - h; x <= MID + h; x++) {
    if (y >= SAND_TOP_ROW && y < NECK) TOP_SAND.push([x, y]);
    if (y > NECK) BOTTOM.push([x, y]);
  }
}
const CAPS: Cell[] = Array.from({ length: W }, (_, x) => [[x, 0] as Cell, [x, H - 1] as Cell]).flat();
const SAND = TOP_SAND.length;
const dx = ([x]: Cell) => Math.abs(x - MID);
// The top empties from its surface down, the middle a little first: a shallow crater.
const EMPTY_ORDER = [...TOP_SAND].sort((a, b) => a[1] + 0.2 * dx(a) - (b[1] + 0.2 * dx(b)) || dx(a) - dx(b));
// The bottom fills from the floor up, the middle first: a mound.
const FILL_ORDER = [...BOTTOM].sort((a, b) => H - 2 - a[1] + 0.6 * dx(a) - (H - 2 - b[1] + 0.6 * dx(b)) || dx(a) - dx(b));
/** How long a flip's turn lasts: the `animate-hourglass-turn` animation (globals.css). */
const TURN_MS = 540;
/** How far the server's start may sit from this browser's guess and still be the same flip. */
const SAME_FLIP_MS = 3_000;

const SHINE: Cell[] = [
  [MID - 5, 3],
  [MID - 5, 4],
  [MID - 4, 2],
  [MID - 5, 21],
  [MID - 5, 22],
];

export type HourglassTone = "running" | "over";

const TONES: Record<HourglassTone, { frame: string; glass: string; sand: string }> = {
  running: {
    frame: "fill-gray-400 dark:fill-gray-500",
    glass: "fill-gray-300 dark:fill-gray-600",
    sand: "fill-blue-500 dark:fill-blue-400",
  },
  over: {
    frame: "fill-amber-500 dark:fill-amber-400",
    glass: "fill-amber-300 dark:fill-amber-600",
    sand: "fill-amber-500 dark:fill-amber-400",
  },
};

interface PixelHourglassProps {
  /** Share of the sand still in the top bulb, 0–1. */
  fraction: number;
  tone: HourglassTone;
  /** CSS pixels per cell: 1.5 lands on whole device pixels on a 2× screen. */
  cell?: number;
  /** When the timebox was flipped: a new flip turns the glass over. */
  flippedAt: number;
  /** Whether the glass turns as it first appears: a timebox flipped a moment ago. */
  turnOnMount?: boolean;
  className?: string;
}

function rects(cells: readonly Cell[]) {
  return cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
}

export function PixelHourglass({
  fraction,
  tone,
  cell = 1.5,
  flippedAt,
  turnOnMount = false,
  className,
}: PixelHourglassProps): ReactElement {
  // A flip lands twice, as this browser's guess and then the server's start:
  // starts a moment apart are the same flip, which turns the glass once.
  const [seenFlip, setSeenFlip] = useState(flippedAt);
  const [turning, setTurning] = useState(turnOnMount);
  if (flippedAt !== seenFlip) {
    setSeenFlip(flippedAt);
    if (Math.abs(flippedAt - seenFlip) > SAME_FLIP_MS) setTurning(true);
  }

  // The turn lasts as long as its animation; with motion reduced it is skipped
  // and the new reading shows at once.
  useEffect(() => {
    if (!turning) return;
    const id = setTimeout(() => setTurning(false), TURN_MS);
    return () => clearTimeout(id);
  }, [turning]);

  const falling = tone === "running" && !turning;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!falling) return;
    const id = setInterval(() => setTick((t) => t + 1), 110);
    return () => clearInterval(id);
  }, [falling]);

  const top = turning ? 0 : Math.round(SAND * Math.min(1, Math.max(0, fraction)));
  const topSand = EMPTY_ORDER.slice(SAND - top);
  const bottomSand = FILL_ORDER.slice(0, SAND - top);

  // The stream: a grain every third cell from the neck down to the pile, moving down.
  const stream: Cell[] = [];
  if (falling && top > 0) {
    const pileTop = Math.min(H - 1, ...bottomSand.filter(([x]) => x === MID).map(([, y]) => y));
    for (let y = NECK; y < pileTop; y++) {
      if (y === NECK || (((y - tick) % 3) + 3) % 3 === 0) stream.push([MID, y]);
    }
  }

  const colors = TONES[tone];
  return (
    <span
      aria-hidden="true"
      className={cn("block motion-safe:data-[turning=true]:animate-hourglass-turn", className)}
      data-turning={turning}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width={W * cell} height={H * cell} shapeRendering="crispEdges" className="block">
        <g className={colors.frame}>{rects(CAPS)}</g>
        <g className={colors.glass}>{rects(GLASS)}</g>
        <g className={colors.sand}>
          {rects(topSand)}
          {rects(bottomSand)}
          {rects(stream)}
        </g>
        <g className="fill-white/70 dark:fill-white/15">{rects(SHINE)}</g>
      </svg>
    </span>
  );
}
