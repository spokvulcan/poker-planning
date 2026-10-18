"use client";

import { Id } from "@/convex/_generated/dataModel";
import { useCallback, useEffect, useState } from "react";
import {
  calculateCurrentTime,
  type TimerState,
} from "@/convex/timerState";
import { useTimerActions } from "./use-timer-actions";

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
 * The retro's timer, a manual stopwatch. Its display derives entirely from the
 * persisted state delivered with the canvas node (`api.canvas.getCanvasNodes`
 * via buildRetroNodes) — there is no second subscription. While the timer
 * runs, a 100ms local interval re-reads the clock through the shared math
 * (`@/convex/timerState`) so the display ticks smoothly between server
 * snapshots; paused/reset states are static and re-derive whenever the node
 * data changes.
 *
 * Writes go through the timer's action seam (useTimerActions), which holds
 * the missing-user guard and says why a write failed.
 */
export function useTimerSync({
  roomId,
  nodeId,
  userId,
  timerState,
}: UseTimerSyncProps): UseTimerSyncReturn {
  // The seam also owns failure reporting (a toast through runAct, same as
  // the board's other writes), so this hook carries no error state of its own.
  const actions = useTimerActions({ roomId, currentUserId: userId });

  // Local clock for smooth ticking while running
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timerState.isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [timerState.isRunning]);

  // Control functions — thin adapters over the seam. The seam's methods hold
  // frozen identities, so these stay stable too (nodeId is the only input).
  const onStart = useCallback(() => actions.startTimer(nodeId), [actions, nodeId]);
  const onPause = useCallback(() => actions.pauseTimer(nodeId), [actions, nodeId]);
  const onReset = useCallback(() => actions.resetTimer(nodeId), [actions, nodeId]);

  // Current display values, computed via the shared math.
  const { currentSeconds, isRunning, displayTime } = calculateCurrentTime(timerState, now);

  return {
    currentSeconds,
    isRunning,
    displayTime,
    onStart,
    onPause,
    onReset,
  };
}
