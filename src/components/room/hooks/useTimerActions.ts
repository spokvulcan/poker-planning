"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";
import { useStableActions } from "@/hooks/useStableActions";
import { runAct } from "@/lib/run-act";

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
 * missing-user guard and failure copy (runAct) as useCanvasActions — without
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

  // All three controls share one shape: guard, write, say why on failure.
  const timerCall =
    (
      mutate: (args: { roomId: Id<"rooms">; nodeId: string }) => Promise<unknown>,
      label: string,
    ) =>
    async (nodeId: string) => {
      if (isDemo || !currentUserId) return;
      await runAct(mutate({ roomId, nodeId }), `The timer didn't ${label}. Try again.`);
    };

  return useStableActions<TimerActions>({
    startTimer: timerCall(startTimerMutation, "start"),
    pauseTimer: timerCall(pauseTimerMutation, "pause"),
    resetTimer: timerCall(resetTimerMutation, "reset"),
  });
}
