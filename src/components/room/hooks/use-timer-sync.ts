"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useCallback, useEffect, useState } from "react";
import {
  calculateCurrentTime,
  type TimerState,
} from "@/convex/timerState";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";

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

  // Error state
  error: string | null;
}

/**
 * The timer's display derives entirely from the persisted state delivered with
 * the canvas node (`api.canvas.getCanvasNodes` via buildCanvasNodes) — there is
 * no second subscription. While the timer runs, a 100ms local interval re-reads
 * the clock through the shared math (`@/convex/timerState`) so the display ticks
 * smoothly between server snapshots; paused/reset states are static and re-derive
 * whenever the node data changes.
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

  // Convex hooks
  const startTimerMutation = useMutation(api.timer.startTimer);
  const pauseTimerMutation = useMutation(api.timer.pauseTimer);
  const resetTimerMutation = useMutation(api.timer.resetTimer);

  // Local clock for smooth ticking while running
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo || !timerState.isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [demo, timerState.isRunning]);

  // Control functions
  const onStart = useCallback(async () => {
    if (!userId) {
      setError("User ID required to control timer");
      return;
    }

    try {
      setError(null);
      await startTimerMutation({ roomId, nodeId, userId });
    } catch (err) {
      console.error("Failed to start timer:", err);
      setError("Failed to start timer");
    }
  }, [startTimerMutation, roomId, nodeId, userId]);

  const onPause = useCallback(async () => {
    if (!userId) {
      setError("User ID required to control timer");
      return;
    }

    try {
      setError(null);
      await pauseTimerMutation({ roomId, nodeId, userId });
    } catch (err) {
      console.error("Failed to pause timer:", err);
      setError("Failed to pause timer");
    }
  }, [pauseTimerMutation, roomId, nodeId, userId]);

  const onReset = useCallback(async () => {
    if (!userId) {
      setError("User ID required to control timer");
      return;
    }

    try {
      setError(null);
      await resetTimerMutation({ roomId, nodeId, userId });
    } catch (err) {
      console.error("Failed to reset timer:", err);
      setError("Failed to reset timer");
    }
  }, [resetTimerMutation, roomId, nodeId, userId]);

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
    error,
  };
}
