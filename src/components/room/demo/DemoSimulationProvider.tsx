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
import type { RoundClockView } from "@/convex/model/roundClock";
import { DEFAULT_TIMEBOX_MS, type BreakFact, type RoundFact } from "@/convex/roundTime";
import { cardNumericValue } from "@/convex/scales";
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
  /** The round clock, timed in this browser as the bots vote: in the shape `api.roundClock.get` returns. */
  roundClock: RoundClockView;
}

const DemoSimulationContext = createContext<DemoSimulationContextValue | null>(
  null,
);

/** Returns the demo context, or `null` outside a demo tree (i.e. real rooms). */
export function useDemoSimulation(): DemoSimulationContextValue | null {
  return useContext(DemoSimulationContext);
}

/**
 * The single source for "are we in the demo?" (#214). Derives the answer from
 * the provider seam — the same fact the data-bypass branches on — so the signal
 * never travels a parallel `isDemoMode` prop channel that could disagree.
 *
 * Load-bearing invariant: `DemoSimulationProvider` is mounted iff the page is
 * the demo simulation. Real-room pages must not mount it, which is what makes
 * this return `false` in live rooms and `true` under `/demo`. Any consumer
 * rendered inside the provider gets the correct signal for free.
 */
export function useIsDemoMode(): boolean {
  return !!useDemoSimulation();
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
    retained: false,
    // `isGameOver` is this codebase's per-round reveal toggle, NOT a terminal
    // "session done" flag: reveal sets it true and the next round's reset clears
    // it (votingRound.ts reveal/reset), and phaseOf returns "revealed" iff it is
    // true. Mapping it from the reducer's `revealed` phase is what flips the
    // cards and mounts the results node each cycle (RoomCanvas), exactly as a
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
    // The bots are always at it, so the round clock never sees a long quiet.
    lastActivityAt: Date.now(),
    // votingScale omitted → defaults to numeric Fibonacci, matching the old demo
    // room (which never set a scale) for both the card row and the stats.
  };
}

/** Most rounds the demo's clock keeps: the bots re-vote one issue for as long as the page is open. */
const DEMO_MAX_ROUNDS = 50;

/**
 * The demo's rounds after the phase moved from `from` to `to` at `now`: a
 * reveal ends the open round's voting, and the next round (revealed back to
 * voting) ends it and opens another on the same issue.
 */
function advanceDemoRounds(rounds: RoundFact[], from: string, to: string, now: number): RoundFact[] {
  const open = rounds.at(-1);
  if (!open) return rounds;
  if (to === "revealed") {
    return [...rounds.slice(0, -1), { ...open, votingEndedAt: now, revealedAt: now }];
  }
  if (from === "revealed") {
    const ended = { ...open, endedAt: now };
    return [...rounds.slice(0, -1), ended, { issueId: open.issueId, startedAt: now }].slice(-DEMO_MAX_ROUNDS);
  }
  return rounds;
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
    return {
      _id: `demo-vote-${b.id}` as Id<"votes">,
      _creationTime: 0,
      roomId: DEMO_ROOM_ID,
      userId: b.id,
      cardLabel: revealed ? label : undefined,
      cardValue: revealed ? cardNumericValue(label) : undefined,
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

  // The round clock the bots run, timed here and nowhere else.
  const [sessionStartedAt] = useState(() => Date.now());
  const [rounds, setRounds] = useState<RoundFact[]>(() => [
    { issueId: DEMO_CURRENT_ISSUE._id, startedAt: Date.now() },
  ]);
  // The simulation stops while the tab is hidden; so does its clock.
  const [breaks, setBreaks] = useState<BreakFact[]>([]);
  const [seenPhase, setSeenPhase] = useState(state.phase);
  if (state.phase !== seenPhase) {
    setSeenPhase(state.phase);
    setRounds((current) => advanceDemoRounds(current, seenPhase, state.phase, Date.now()));
  }

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
    let hiddenAt: number | null = null;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
        hiddenAt = Date.now();
      } else {
        start();
        if (hiddenAt !== null) {
          const from = hiddenAt;
          setBreaks((current) => [...current, { from, to: Date.now(), kind: "pause" }]);
          hiddenAt = null;
        }
      }
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
      roundClock: {
        sessionStartedAt,
        pausedAt: null,
        timebox: null,
        timeboxMs: DEFAULT_TIMEBOX_MS,
        current: rounds,
        items: [{ issueId: DEMO_CURRENT_ISSUE._id, title: DEMO_CURRENT_ISSUE.title, rounds }],
        breaks,
      },
    }),
    [state, rounds, breaks, sessionStartedAt],
  );

  return (
    <DemoSimulationContext.Provider value={value}>
      {children}
    </DemoSimulationContext.Provider>
  );
}
