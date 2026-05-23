"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useCallback, useEffect, useState, useRef } from "react";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";

interface UseTimerSyncProps {
  roomId: Id<"rooms">;
  nodeId: string;
  userId?: Id<"users">;
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
  
  // Loading states
  isLoading: boolean;
  error: string | null;
}

export function useTimerSync({
  roomId,
  nodeId,
  userId,
}: UseTimerSyncProps): UseTimerSyncReturn {
  // In the Demo simulation the timer is local and stopped — never subscribe to
  // `api.timer.getTimerState` (zero reads, ADR-0003). Real rooms subscribe.
  const demo = useDemoSimulation();

  // Convex hooks
  const serverTimerState = useQuery(
    api.timer.getTimerState,
    demo ? "skip" : { roomId, nodeId },
  );
  const startTimerMutation = useMutation(api.timer.startTimer);
  const pauseTimerMutation = useMutation(api.timer.pauseTimer);
  const resetTimerMutation = useMutation(api.timer.resetTimer);

  // Local state for smooth timer display
  const [localSeconds, setLocalSeconds] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync local state with server state - intentional state sync pattern
  useEffect(() => {
    if (serverTimerState) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalSeconds(serverTimerState.currentSeconds);
      setLastSyncTime(Date.now());
      setError(null);
    }
  }, [serverTimerState]);

  // Handle local timer ticking for smooth display
  useEffect(() => {
    if (serverTimerState?.isRunning) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsedSinceSync = (now - lastSyncTime) / 1000;
        setLocalSeconds(serverTimerState.currentSeconds + elapsedSinceSync);
      }, 100); // Update more frequently for smooth display
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [serverTimerState?.isRunning, serverTimerState?.currentSeconds, lastSyncTime]);

  // Format time display
  const formatTime = useCallback((totalSeconds: number): string => {
    const seconds = Math.floor(totalSeconds);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }, []);

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

  // Calculate current display values. In demo mode the timer is a local,
  // stopped 0:00 (no server state, never loading).
  const currentSeconds = demo ? 0 : Math.floor(localSeconds);
  const isRunning = demo ? false : (serverTimerState?.isRunning ?? false);
  const displayTime = demo ? "0:00" : formatTime(localSeconds);
  const isLoading = demo ? false : serverTimerState === undefined;

  return {
    currentSeconds,
    isRunning,
    displayTime,
    onStart,
    onPause,
    onReset,
    isLoading,
    error,
  };
}