"use client";

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoundClockView } from "@/convex/model/roundClock";
import { liveBreaks, type BreakFact } from "@/convex/roundTime";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";

/** This browser's clock, moving on each whole second so every reading on the board changes in step. */
function useSecondTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setNow(Date.now());
      interval = setInterval(() => setNow(Date.now()), 1000);
    }, 1000 - (Date.now() % 1000));
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);
  return now;
}

export interface RoundClockReading {
  view: RoundClockView | undefined;
  now: number;
  /** The breaks the facts hold, plus those still running: a pause, and the quiet past IDLE_MS. */
  breaks: BreakFact[];
}

/**
 * The round clock the board's time nodes read (ADR-0032): its facts from
 * Convex, or the Demo simulation's (zero reads, ADR-0003), against this
 * browser's clock ticking once a second. Nodes of one room share the one
 * subscription.
 */
export function useRoundClock(roomId: Id<"rooms">, lastActivityAt: number): RoundClockReading {
  const demo = useDemoSimulation();
  const live = useQuery(api.roundClock.get, demo ? "skip" : { roomId });
  const now = useSecondTick();
  const view = demo ? demo.roundClock : live;
  const breaks = view ? [...view.breaks, ...liveBreaks(now, { pausedAt: view.pausedAt, lastActivityAt })] : [];
  return { view, now, breaks };
}
