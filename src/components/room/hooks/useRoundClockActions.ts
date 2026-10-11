"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";
import { useStableActions } from "@/hooks/useStableActions";
import { runAct, WRITE_FAILED } from "@/lib/run-act";
import type { TimeNode } from "@/convex/model/canvas";

/** The round clock's writes (ADR-0032), behind one frozen-identity object. */
export interface RoundClockActions {
  startTimebox: (durationMs: number) => void;
  extendTimebox: () => void;
  stopTimebox: () => void;
  pauseClock: () => void;
  resumeClock: () => void;
  setTimeNodeShown: (node: TimeNode, shown: boolean) => void;
}

interface UseRoundClockActionsProps {
  roomId: Id<"rooms">;
  currentUserId?: Id<"users">;
}

/**
 * The round clock's slice of the action-seam policy: the demo no-op (ADR-0003),
 * the missing-user guard and failure copy (runAct), as useCanvasActions. Each
 * write lands on the clock (or the board) before the server answers, so a flip
 * turns the glass and a hide takes the node away at once; Convex settles them
 * to the server's answer.
 */
export function useRoundClockActions({ roomId, currentUserId }: UseRoundClockActionsProps): RoundClockActions {
  const isDemo = useDemoSimulation() !== null;

  const startTimebox = useMutation(api.roundClock.startTimebox).withOptimisticUpdate(flipLocally);
  const stopTimebox = useMutation(api.roundClock.stopTimebox).withOptimisticUpdate(stopLocally);
  const extendTimebox = useMutation(api.roundClock.extendTimebox);
  const pause = useMutation(api.roundClock.pause).withOptimisticUpdate(pauseLocally);
  const resume = useMutation(api.roundClock.resume).withOptimisticUpdate(resumeLocally);
  const setTimeNodeShown = useMutation(api.canvas.setTimeNodeShown).withOptimisticUpdate(showLocally);

  const write = (call: () => Promise<unknown>) => async () => {
    if (isDemo || !currentUserId) return;
    await runAct(call(), WRITE_FAILED);
  };

  return useStableActions<RoundClockActions>({
    startTimebox: (durationMs) => void write(() => startTimebox({ roomId, durationMs }))(),
    extendTimebox: write(() => extendTimebox({ roomId })),
    stopTimebox: write(() => stopTimebox({ roomId })),
    pauseClock: write(() => pause({ roomId })),
    resumeClock: write(() => resume({ roomId })),
    setTimeNodeShown: (node, shown) => void write(() => setTimeNodeShown({ roomId, node, shown }))(),
  });
}

// Each write as it lands on this browser's copy before the server answers.
// They run when a write is made, never while rendering.

function flipLocally(store: OptimisticLocalStore, args: { roomId: Id<"rooms">; durationMs: number }) {
  const clock = store.getQuery(api.roundClock.get, { roomId: args.roomId });
  if (!clock) return;
  store.setQuery(api.roundClock.get, { roomId: args.roomId }, {
    ...clock,
    timebox: { startedAt: Date.now(), durationMs: args.durationMs },
    timeboxMs: args.durationMs,
  });
}

function stopLocally(store: OptimisticLocalStore, args: { roomId: Id<"rooms"> }) {
  const clock = store.getQuery(api.roundClock.get, { roomId: args.roomId });
  if (clock) store.setQuery(api.roundClock.get, { roomId: args.roomId }, { ...clock, timebox: null });
}

function pauseLocally(store: OptimisticLocalStore, args: { roomId: Id<"rooms"> }) {
  const clock = store.getQuery(api.roundClock.get, { roomId: args.roomId });
  if (clock && clock.pausedAt === null) {
    store.setQuery(api.roundClock.get, { roomId: args.roomId }, { ...clock, pausedAt: Date.now() });
  }
}

function resumeLocally(store: OptimisticLocalStore, args: { roomId: Id<"rooms"> }) {
  const clock = store.getQuery(api.roundClock.get, { roomId: args.roomId });
  if (!clock || clock.pausedAt === null) return;
  store.setQuery(api.roundClock.get, { roomId: args.roomId }, {
    ...clock,
    pausedAt: null,
    breaks: [...clock.breaks, { from: clock.pausedAt, to: Date.now(), kind: "pause" }],
  });
}

function showLocally(store: OptimisticLocalStore, args: { roomId: Id<"rooms">; node: TimeNode; shown: boolean }) {
  const nodes = store.getQuery(api.canvas.getCanvasNodes, { roomId: args.roomId });
  if (!nodes) return;
  const nodeId = args.node === "timer" ? "timer" : "session-time";
  store.setQuery(
    api.canvas.getCanvasNodes,
    { roomId: args.roomId },
    nodes.map((node) => (node.nodeId === nodeId ? { ...node, isHidden: !args.shown } : node)),
  );
}
