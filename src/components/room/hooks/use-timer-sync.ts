"use client";

import { Id } from "@/convex/_generated/dataModel";
import { useCallback, useEffect, useState } from "react";
import {
  calculateCurrentTime,
  type TimerState,
} from "@/convex/timerState";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";
import { useCanvasActions } from "./useCanvasActions";

interface UseTimerSyncProps {
  roomId: Id<"rooms">;
  nodeId: string;
  userId?: Id<"users">;
  timerState: TimerState;
}

interface UseTimerSyncReturn {
  // Timer state
  currentSeconds: number;
  isRunning: boolean;
  displayTime: string;

  // Control functions
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
}

/**
 * The timer's display derives entirely from the persisted state delivered with
 * the canvas node (`api.canvas.getCanvasNodes` via buildCanvasNodes) — there is
 * no second subscription. While the timer runs, a 100ms local interval re-reads
 * the clock through the shared math (`@/convex/timerState`) so the display ticks
 * smoothly between server snapshots; paused/reset states are static and re-derive
 * whenever the node data changes.
 *
 * Writes go through the canvas-actions seam (useCanvasActions): the demo no-op
 * policy and the missing-user guard live there with every other canvas write
 * (ADR-0003), so the old "User ID required" red error is unreachable — in the
 * demo every action silently no-ops, in a real room the viewer always exists.
 */
export function useTimerSync({
  roomId,
  nodeId,
  userId,
  timerState,
}: UseTimerSyncProps): UseTimerSyncReturn {
  // In the Demo simulation the timer is local and stopped — it renders 0:00
  // from the demo provider and never touches Convex (zero reads, ADR-0003).
  const demo = useDemoSimulation();

  // The seam also owns failure reporting (console, same as reveal/reset), so
  // this hook no longer carries an error state of its own.
  const actions = useCanvasActions({ roomId, currentUserId: userId });

  // Local clock for smooth ticking while running
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (demo || !timerState.isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [demo, timerState.isRunning]);

  // Control functions — thin adapters over the seam. The seam's methods hold
  // frozen identities, so these stay stable too (nodeId is the only input).
  const onStart = useCallback(() => actions.startTimer(nodeId), [actions, nodeId]);
  const onPause = useCallback(() => actions.pauseTimer(nodeId), [actions, nodeId]);
  const onReset = useCallback(() => actions.resetTimer(nodeId), [actions, nodeId]);

  // Current display values, computed via the shared math. In demo mode the
  // timer is a local, stopped 0:00 regardless of the fixture state.
  const { currentSeconds, isRunning, displayTime } = demo
    ? { currentSeconds: 0, isRunning: false, displayTime: "0:00" }
    : calculateCurrentTime(timerState, now);

  return {
    currentSeconds,
    isRunning,
    displayTime,
    onStart,
    onPause,
    onReset,
  };
}
