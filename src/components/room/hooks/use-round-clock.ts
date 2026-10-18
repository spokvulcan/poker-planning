"use client";

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sessionReading, timerReading, type SessionReading, type TimerReading } from "@/convex/roundTime";
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

/** What the board's time nodes show, read from the round clock this second. */
export interface RoundClockReading {
  timer: TimerReading;
  session: SessionReading;
}

/**
 * The round clock as the board's time nodes show it (ADR-0032): its facts
 * from Convex, or the Demo simulation's (zero reads, ADR-0003), read by
 * convex/roundTime.ts against this browser's clock ticking once a second.
 * Nodes of one room share the one subscription, and draw what they're given.
 */
export function useRoundClock(roomId: Id<"rooms">, lastActivityAt: number): RoundClockReading {
  const demo = useDemoSimulation();
  const live = useQuery(api.roundClock.get, demo ? "skip" : { roomId });
  const now = useSecondTick();
  const view = demo ? demo.roundClock : live;
  return { timer: timerReading(view, now, lastActivityAt), session: sessionReading(view, now, lastActivityAt) };
}
