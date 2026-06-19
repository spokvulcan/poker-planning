/**
 * Demo simulation reducer (Module 1) — the deep, pure core of the feature.
 *
 * No React, no timers, no IO. Given the current state, the elapsed time, and an
 * injected RNG, it advances the phase machine
 *   voting → countingDown → revealed → (reset) → voting
 * exactly the way the server-driven demo used to, but locally and deterministic
 * under test. It mirrors `phaseOf` semantics (see CONTEXT.md / ADR-0003): the
 * three phases map 1:1 onto a real round's, and the reveal reuses the one pure
 * results computation, `summarize`, so the demo's numbers can never diverge from
 * a real round's.
 *
 * Randomness is injectable so the reducer is fully deterministic in tests; the
 * provider passes `Math.random` for natural variance across viewers.
 */
import { summarize, type VoteSummary } from "@/convex/summarize";

/** Mirrors `VotingRound.Phase`. There is no idle phase — see ADR-0002/0003. */
export type DemoPhase = "voting" | "countingDown" | "revealed";

export interface DemoSimulationState {
  phase: DemoPhase;
  /** botId → cardLabel cast in the current round. */
  votes: Record<string, string>;
  /** Time accumulated in the current phase (drives countdown + reveal hold). */
  phaseElapsedMs: number;
  /** Time since the last vote-cycle attempt (advances only in `voting`). */
  sinceVoteCycleMs: number;
}

export interface DemoReducerBot {
  id: string;
  /** Cards this bot tends to play; a cycle picks one at random. */
  preferredCards: readonly string[];
}

export interface DemoReducerConfig {
  bots: readonly DemoReducerBot[];
  /** Chance (0–1) a vote-cycle casts at all, for natural pacing. */
  voteProbability: number;
  /** Cadence of bot vote-cycles while in `voting`. */
  voteIntervalMs: number;
  /** Local auto-reveal countdown duration (mirrors the real round's). */
  countdownMs: number;
  /** How long the revealed result holds before resetting. */
  resultsDisplayMs: number;
}

/** A source of randomness in [0, 1). Injected so the reducer is deterministic. */
export type Rng = () => number;

export interface DemoTickInput {
  /** Time since the previous tick. Zero models a paused (hidden) tab. */
  elapsedMs: number;
  rng: Rng;
}

const MAX_CYCLES_PER_TICK = 100; // defensive bound on the vote-cycle loop

export function initialDemoState(): DemoSimulationState {
  return { phase: "voting", votes: {}, phaseElapsedMs: 0, sinceVoteCycleMs: 0 };
}

/**
 * Advances the simulation by `elapsedMs`. A non-advancing tick (`elapsedMs <= 0`)
 * returns the same state reference — this is how the provider models "paused
 * while the tab is hidden, resume from the current phase with no fast-forward".
 *
 * A single tick performs at most one phase transition (e.g. a tick that fills
 * the table flips to `countingDown` but does not also run the countdown). With
 * the provider's small tick interval the dropped remainder is imperceptible.
 */
export function advanceDemo(
  state: DemoSimulationState,
  config: DemoReducerConfig,
  input: DemoTickInput,
): DemoSimulationState {
  if (input.elapsedMs <= 0) return state;

  switch (state.phase) {
    case "voting":
      return advanceVoting(state, config, input);
    case "countingDown":
      return advancePhaseTimer(state, input.elapsedMs, config.countdownMs, {
        phase: "revealed",
        votes: state.votes, // retain votes for the revealed view
      });
    case "revealed":
      return advancePhaseTimer(
        state,
        input.elapsedMs,
        config.resultsDisplayMs,
        initialDemoState(), // reset to a fresh round on the same target
      );
  }
}

/** Accumulates bot votes; arms the countdown once every bot has voted. */
function advanceVoting(
  state: DemoSimulationState,
  config: DemoReducerConfig,
  input: DemoTickInput,
): DemoSimulationState {
  let votes = state.votes;
  let sinceVoteCycleMs = state.sinceVoteCycleMs + input.elapsedMs;

  let cycles = 0;
  while (
    sinceVoteCycleMs >= config.voteIntervalMs &&
    cycles++ < MAX_CYCLES_PER_TICK
  ) {
    sinceVoteCycleMs -= config.voteIntervalMs;
    votes = runVoteCycle(votes, config, input.rng);
    if (everyBotVoted(votes, config.bots)) break;
  }

  if (everyBotVoted(votes, config.bots)) {
    // The full table arms the local auto-reveal countdown (auto-complete is
    // always on in the demo) — mirroring the round's private evaluate helper.
    return { phase: "countingDown", votes, phaseElapsedMs: 0, sinceVoteCycleMs: 0 };
  }
  return { ...state, votes, sinceVoteCycleMs };
}

/** One bot vote-cycle: ~`voteProbability` chance to cast 1–3 unfilled bots. */
function runVoteCycle(
  votes: Record<string, string>,
  config: DemoReducerConfig,
  rng: Rng,
): Record<string, string> {
  const remaining = config.bots.filter((b) => votes[b.id] === undefined);
  if (remaining.length === 0) return votes;
  if (rng() > config.voteProbability) return votes; // skip this cycle

  const count = Math.min(remaining.length, 1 + Math.floor(rng() * 3));
  const chosen = pickN(remaining, count, rng);

  const next = { ...votes };
  for (const bot of chosen) {
    const card = bot.preferredCards[Math.floor(rng() * bot.preferredCards.length)];
    next[bot.id] = card;
  }
  return next;
}

/** Partial Fisher–Yates: deterministic selection of `n` items via `rng`. */
function pickN<T>(items: readonly T[], n: number, rng: Rng): T[] {
  const arr = [...items];
  const limit = Math.min(n, arr.length);
  for (let i = 0; i < limit; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, limit);
}

function everyBotVoted(
  votes: Record<string, string>,
  bots: readonly DemoReducerBot[],
): boolean {
  return bots.length > 0 && bots.every((b) => votes[b.id] !== undefined);
}

/**
 * Accumulates time in the current phase; once it reaches `durationMs`, returns
 * the `next` state (with `phaseElapsedMs` reset). Used for both the countdown
 * (→ revealed) and the reveal hold (→ fresh round).
 */
function advancePhaseTimer(
  state: DemoSimulationState,
  elapsedMs: number,
  durationMs: number,
  next: Pick<DemoSimulationState, "phase" | "votes">,
): DemoSimulationState {
  const phaseElapsedMs = state.phaseElapsedMs + elapsedMs;
  if (phaseElapsedMs >= durationMs) {
    return {
      phase: next.phase,
      votes: next.votes,
      phaseElapsedMs: 0,
      sinceVoteCycleMs: 0,
    };
  }
  return { ...state, phaseElapsedMs };
}

/**
 * The revealed round's results, via the one shared pure computation. The
 * provider feeds the same votes to the ResultsNode, so the panel and any
 * derived numbers agree by construction.
 */
export function summarizeDemoVotes(
  votes: Record<string, string>,
  scale?: { isNumeric: boolean },
): VoteSummary {
  return summarize(
    Object.values(votes).map((cardLabel) => ({ cardLabel })),
    scale,
  );
}

/**
 * A small seeded PRNG (mulberry32) — deterministic randomness for tests and for
 * any caller wanting reproducible runs. The provider uses `Math.random`.
 */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
