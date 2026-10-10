/**
 * The round's phase — the ONE derivation of the voting round's lifecycle
 * state, kept at the Convex root (alongside the permission decision and
 * `summarize`) so both server and browser code can import it. Derived (never
 * stored) from existing room fields — see ADR-0002. There is no `idle`: a
 * target-less, unrevealed room is an active Quick Vote in `voting`,
 * indistinguishable from a fresh one.
 *
 * It also says what each phase allows, as `retroSteps` does for a retro's
 * step (CONTEXT.md: Transition). The round asks it before a start, a reveal or
 * a vote and refuses quietly what it doesn't allow; the board's controls can
 * read the same answer.
 */

import type { Doc } from "./_generated/dataModel";

export type Phase = "voting" | "countingDown" | "revealed";

/**
 * phaseOf — the round's phase as one derived read, so callers branch on a
 * single phase instead of re-deriving it from the raw `isGameOver` / countdown
 * fields. Encodes the "revealed wins" tie-break: a stale countdown timestamp
 * never outranks a settled round.
 */
export function phaseOf(room: {
  isGameOver: boolean;
  autoRevealCountdownStartedAt?: number;
}): Phase {
  if (room.isGameOver) return "revealed";
  if (room.autoRevealCountdownStartedAt) return "countingDown";
  return "voting";
}

/** Something done in a round that its phase may refuse. */
export type RoundAct =
  /** Settle the round: a person's reveal or the scheduled one. */
  | "reveal"
  /** Cast, change or take back a vote. */
  | "vote";

/**
 * Whether the round's phase lets an act happen at all. A round reveals once,
 * and its votes close at the reveal, since the results were taken from the
 * cards as they lay. The phase refuses nothing else: a reveal from
 * `countingDown` cancels the countdown first, abandoning mid-countdown drops
 * it, and a reset mid-vote throws the votes away on purpose. The round refuses
 * quietly, changing nothing, the way a stale scheduled reveal reveals nothing.
 */
export function phaseAllows(phase: Phase, act: RoundAct): boolean {
  switch (act) {
    case "reveal":
    case "vote":
      return phase !== "revealed";
  }
}

/**
 * Whether a round can start on an issue. The phase can't say: a start reads
 * its target's status. Starting the issue already being voted on is refused,
 * since it would throw its votes away and time a second round over the open
 * one; any other issue starts, a completed one included. A Quick Vote has no
 * status and always starts.
 */
export function startAllowed(issue: Pick<Doc<"issues">, "status">): boolean {
  return issue.status !== "voting";
}
