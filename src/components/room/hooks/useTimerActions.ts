"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";
import { useStableActions } from "@/hooks/useStableActions";

/** The TimerNode's three writes, behind one frozen-identity object. */
export interface TimerActions {
  startTimer: (nodeId: string) => void;
  pauseTimer: (nodeId: string) => void;
  resetTimer: (nodeId: string) => void;
}

interface UseTimerActionsProps {
  roomId: Id<"rooms">;
  currentUserId?: Id<"users">;
}

/**
 * The timer's slice of the action-seam policy — the same demo no-op (ADR-0003),
 * missing-user guard and console failure reporting as useCanvasActions — without
 * mounting the full canvas seam per TimerNode. Frozen method identity comes from
 * useStableActions, like every other *Actions seam.
 */
export function useTimerActions({
  roomId,
  currentUserId,
}: UseTimerActionsProps): TimerActions {
  const isDemo = useDemoSimulation() !== null;

  const startTimerMutation = useMutation(api.timer.startTimer);
  const pauseTimerMutation = useMutation(api.timer.pauseTimer);
  const resetTimerMutation = useMutation(api.timer.resetTimer);

  // All three controls share one shape: guard, write, log on failure.
  const timerCall =
    (
      mutate: (args: {
        roomId: Id<"rooms">;
        nodeId: string;
        userId: Id<"users">;
      }) => Promise<unknown>,
      label: string,
    ) =>
    async (nodeId: string) => {
      if (isDemo || !currentUserId) return;
      try {
        await mutate({ roomId, nodeId, userId: currentUserId });
      } catch (error) {
        console.error(`Failed to ${label} timer:`, error);
      }
    };

  return useStableActions<TimerActions>({
    startTimer: timerCall(startTimerMutation, "start"),
    pauseTimer: timerCall(pauseTimerMutation, "pause"),
    resetTimer: timerCall(resetTimerMutation, "reset"),
  });
}
