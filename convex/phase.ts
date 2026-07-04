/**
 * The round's phase — the ONE derivation of the voting round's lifecycle
 * state, kept at the Convex root (alongside the permission decision and
 * `summarize`) so both server and browser code can import it. Derived (never
 * stored) from existing room fields — see ADR-0002. There is no `idle`: a
 * target-less, unrevealed room is an active Quick Vote in `voting`,
 * indistinguishable from a fresh one.
 */
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
