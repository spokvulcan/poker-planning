/**
 * roundTime — the ONE reading of the round clock's facts (ADR-0032), kept at
 * the Convex root beside `phase` and `timerState` so the server and the
 * browser read time the same way. Pure: no IO, and `now` is always passed in.
 *
 * The backend stores facts: when each round started, ended its voting, was
 * revealed and ended, and the stretches when nobody had the room open,
 * someone paused, or nobody did anything. What counts as a break is decided
 * here, when reading, so a threshold changed later re-reads the past instead
 * of leaving it wrong.
 */

import type { Id } from "./_generated/dataModel";

const MINUTE = 60_000;

/** A gap with nobody in the room this long is a break. Shorter ones count: the team may be reading the ticket elsewhere. */
export const AWAY_BREAK_MS = 10 * MINUTE;
/** Nobody doing anything this long stops the clock: the first IDLE_MS count, the rest is a break. */
export const IDLE_MS = 20 * MINUTE;
/** A room nobody had open this long starts a new session when someone opens it. */
export const SESSION_GAP_MS = 30 * MINUTE;
/** The shortest gap in attendance kept as a fact. */
export const AWAY_RECORD_MS = 2 * MINUTE;

/** The timebox lengths a person can pick, and the one a flip starts with first. */
export const TIMEBOX_PRESETS_MS = [1, 2, 3, 5].map((m) => m * MINUTE);
export const DEFAULT_TIMEBOX_MS = 2 * MINUTE;
export const TIMEBOX_MIN_MS = 10_000;
export const TIMEBOX_MAX_MS = 30 * MINUTE;
/** What one "+1 min" adds. */
export const TIMEBOX_EXTENSION_MS = MINUTE;

export type BreakKind = "away" | "pause" | "idle";

/** A stretch the clock may leave out: nobody in the room, a pause, or a long quiet. */
export interface BreakFact {
  from: number;
  to: number;
  kind: BreakKind;
}

/** A voting round as the clock reads it. An open round has no `endedAt`. */
export interface RoundFact {
  issueId?: Id<"issues">;
  startedAt: number;
  votingEndedAt?: number;
  revealedAt?: number;
  endedAt?: number;
}

/** A target's stretch of the session: one issue's consecutive rounds, or one Quick Vote round. */
export interface SessionItem {
  issueId?: Id<"issues">;
  title?: string;
  rounds: RoundFact[];
}

export interface TimeSplit {
  votingMs: number;
  discussionMs: number;
  breakMs: number;
}

type Span = readonly [from: number, to: number];

/**
 * The breaks still running, which no fact holds yet: a pause called and not
 * lifted, and the quiet past IDLE_MS since the room's last action.
 */
export function liveBreaks(now: number, live: { pausedAt?: number | null; lastActivityAt?: number }): BreakFact[] {
  const breaks: BreakFact[] = [];
  if (live.pausedAt != null && live.pausedAt < now) breaks.push({ from: live.pausedAt, to: now, kind: "pause" });
  if (live.lastActivityAt !== undefined && now - live.lastActivityAt > IDLE_MS) {
    breaks.push({ from: live.lastActivityAt + IDLE_MS, to: now, kind: "idle" });
  }
  return breaks;
}

/**
 * The stretches that count as breaks, merged and in order: every pause and
 * long quiet, and the gaps in attendance of AWAY_BREAK_MS or more.
 */
export function countedBreaks(breaks: readonly BreakFact[]): Span[] {
  const spans = breaks
    .filter((b) => b.to > b.from && (b.kind !== "away" || b.to - b.from >= AWAY_BREAK_MS))
    .map((b): Span => [b.from, b.to])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of spans) {
    const last = merged.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

function overlap(span: Span, breaks: readonly Span[]): number {
  let total = 0;
  for (const [from, to] of breaks) {
    const start = Math.max(from, span[0]);
    const end = Math.min(to, span[1]);
    if (end > start) total += end - start;
  }
  return total;
}

/** A round's voting stretch (start to its voting's end) and discussion stretch (reveal to its end), open ones up to `now`. */
export function roundSpans(round: RoundFact, now: number): { voting: Span; discussion: Span | null } {
  const end = round.endedAt ?? now;
  const votingEnd = round.votingEndedAt ?? round.revealedAt ?? end;
  return {
    voting: [round.startedAt, Math.max(round.startedAt, votingEnd)],
    discussion: round.revealedAt !== undefined ? [round.revealedAt, Math.max(round.revealedAt, end)] : null,
  };
}

/**
 * How rounds' time splits into voting, discussion and breaks, from `window.from`
 * (a session's start) to `now`. Breaks come out of whichever stretch they fall in.
 */
export function roundsTime(
  rounds: readonly RoundFact[],
  breaks: readonly BreakFact[],
  now: number,
  window: { from?: number } = {},
): TimeSplit {
  const counted = countedBreaks(breaks);
  const from = window.from ?? -Infinity;
  const clip = (span: Span): Span => [Math.max(span[0], from), Math.min(span[1], now)];
  const split: TimeSplit = { votingMs: 0, discussionMs: 0, breakMs: 0 };
  for (const round of rounds) {
    const spans = roundSpans(round, now);
    for (const [key, span] of [["votingMs", spans.voting], ["discussionMs", spans.discussion]] as const) {
      if (!span) continue;
      const [start, end] = clip(span);
      if (end <= start) continue;
      const paused = overlap([start, end], counted);
      split[key] += end - start - paused;
      split.breakMs += paused;
    }
  }
  return split;
}

/** Rounds in order, grouped into items: one issue's consecutive rounds together, each Quick Vote round alone. */
export function sessionItems(rounds: readonly RoundFact[]): SessionItem[] {
  const items: SessionItem[] = [];
  for (const round of rounds) {
    const last = items.at(-1);
    if (last && round.issueId !== undefined && last.issueId === round.issueId) last.rounds.push(round);
    else items.push({ issueId: round.issueId, rounds: [round] });
  }
  return items;
}

/** Whether any of a round's time falls after `from`: a session holds the rounds that do. */
export function overlapsFrom(round: RoundFact, from: number): boolean {
  return (round.endedAt ?? Infinity) > from;
}

export type TimeboxStatus = "idle" | "running" | "over";

/** The timebox at `now`: how much is left, how far over it is, and the share of sand still on top. */
export function timeboxAt(
  timebox: { startedAt: number; durationMs: number } | null | undefined,
  now: number,
): { status: TimeboxStatus; remainingMs: number; overtimeMs: number; fraction: number } {
  if (!timebox) return { status: "idle", remainingMs: 0, overtimeMs: 0, fraction: 0 };
  // A browser whose clock runs a little behind the server's never sees more than the full length.
  const elapsed = Math.max(0, now - timebox.startedAt);
  const left = timebox.durationMs - elapsed;
  return {
    status: left > 0 ? "running" : "over",
    remainingMs: Math.max(0, left),
    overtimeMs: Math.max(0, -left),
    fraction: Math.min(1, Math.max(0, left / timebox.durationMs)),
  };
}

const pad = (n: number) => n.toString().padStart(2, "0");

/** A duration as a clock reads: m:ss under an hour, h:mm:ss from an hour on. Never negative. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** A countdown reads its whole seconds up: 2:00 at the start, 0:00 only at the end. */
export function countdownText(ms: number): string {
  return clockText(Math.ceil(Math.max(0, ms) / 1000) * 1000);
}
