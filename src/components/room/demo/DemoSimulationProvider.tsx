"use client";

/**
 * DemoSimulationProvider + useDemoSimulation (Module 3).
 *
 * React glue around the pure reducer: it seeds state from the fixtures, ticks
 * the reducer on an interval, and exposes the data the canvas needs — shaped
 * exactly like the Convex queries it replaces — via context. The four canvas
 * hooks read this context in demo mode instead of subscribing (Module 4), so
 * the page costs zero Convex reads.
 *
 * Pausing: the interval stops while the tab is hidden and restarts on return,
 * resuming from the current phase with no fast-forward (each tick advances by a
 * fixed slice, and no hidden time is accumulated).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { CanvasNode } from "@/convex/model/canvas";
import type { RoomWithRelatedData, SanitizedVote } from "@/convex/model/rooms";
import {
  advanceDemo,
  initialDemoState,
  type DemoSimulationState,
} from "./simulation";
import {
  DEMO_BOTS,
  DEMO_CANVAS_NODES,
  DEMO_CURRENT_ISSUE,
  DEMO_ISSUES,
  DEMO_REDUCER_CONFIG,
  DEMO_ROOM_ID,
  DEMO_TICK_MS,
  DEMO_USERS,
} from "./fixtures";

export interface DemoSimulationContextValue {
  /** Shaped as a real room's data so `RoomCanvas` consumes it unchanged. */
  roomData: RoomWithRelatedData;
  /** The persisted-node list, in the shape `api.canvas.getCanvasNodes` returns. */
  canvasNodes: CanvasNode[];
  currentIssue: { _id: Id<"issues">; title: string };
  issues: Doc<"issues">[];
}

const DemoSimulationContext = createContext<DemoSimulationContextValue | null>(
  null,
);

/** Returns the demo context, or `null` outside a demo tree (i.e. real rooms). */
export function useDemoSimulation(): DemoSimulationContextValue | null {
  return useContext(DemoSimulationContext);
}

const CURRENT_ISSUE = {
  _id: DEMO_CURRENT_ISSUE._id,
  title: DEMO_CURRENT_ISSUE.title,
};

/** Builds a real-shaped room document from the current simulation state. */
function buildRoom(state: DemoSimulationState): Doc<"rooms"> {
  return {
    _id: DEMO_ROOM_ID,
    _creationTime: 0,
    name: "Planning Poker Demo",
    roomType: "canvas",
    autoCompleteVoting: true,
    // `isGameOver` is this codebase's per-round reveal toggle, NOT a terminal
    // "session done" flag: reveal sets it true and the next round's reset clears
    // it (votingRound.ts reveal/reset), and phaseOf returns "revealed" iff it is
    // true. Mapping it from the reducer's `revealed` phase is what flips the
    // cards and mounts the results node each cycle (useCanvasNodes), exactly as a
    // real round does — always-false here would mean the demo never reveals.
    isGameOver: state.phase === "revealed",
    // While counting down, anchor the wall-clock start so the SessionNode's
    // countdown (duration - (Date.now() - startedAt)) reflects logical progress
    // and survives pause/resume without jumping.
    autoRevealCountdownStartedAt:
      state.phase === "countingDown"
        ? Date.now() - state.phaseElapsedMs
        : undefined,
    currentIssueId: DEMO_CURRENT_ISSUE._id,
    nextIssueNumber: DEMO_ISSUES.length + 1,
    createdAt: 0,
    lastActivityAt: 0,
    // votingScale omitted → defaults to numeric Fibonacci, matching the old demo
    // room (which never set a scale) for both the card row and the stats.
  };
}

/**
 * Builds sanitized votes, mirroring the backend `sanitizeVotes(..., isGameOver,
 * undefined)`: a bot that has voted is `hasVoted`, but its card stays hidden
 * until the round is revealed.
 */
function buildVotes(state: DemoSimulationState): SanitizedVote[] {
  const revealed = state.phase === "revealed";
  return DEMO_BOTS.filter((b) => state.votes[b.id] !== undefined).map((b) => {
    const label = state.votes[b.id];
    const value = Number.parseFloat(label);
    return {
      _id: `demo-vote-${b.id}` as Id<"votes">,
      _creationTime: 0,
      roomId: DEMO_ROOM_ID,
      userId: b.id,
      cardLabel: revealed ? label : undefined,
      cardValue: revealed && !Number.isNaN(value) ? value : undefined,
      cardIcon: undefined,
      hasVoted: true,
    };
  });
}

export function DemoSimulationProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [state, setState] = useState<DemoSimulationState>(initialDemoState);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      id = setInterval(() => {
        setState((prev) =>
          advanceDemo(prev, DEMO_REDUCER_CONFIG, {
            elapsedMs: DEMO_TICK_MS,
            rng: Math.random,
          }),
        );
      }, DEMO_TICK_MS);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const value = useMemo<DemoSimulationContextValue>(
    () => ({
      roomData: {
        room: buildRoom(state),
        users: DEMO_USERS,
        votes: buildVotes(state),
        isOwnerAbsent: false,
      },
      canvasNodes: DEMO_CANVAS_NODES,
      currentIssue: CURRENT_ISSUE,
      issues: DEMO_ISSUES,
    }),
    [state],
  );

  return (
    <DemoSimulationContext.Provider value={value}>
      {children}
    </DemoSimulationContext.Provider>
  );
}
