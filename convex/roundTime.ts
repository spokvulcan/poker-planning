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
 *
 * Three readings come out of it: a target's time, which the timer shows for
 * the current target and which an issue's time-to-consensus is at the reveal
 * that settles it (ADR-0034); what the timer shows; and what session time
 * shows. The board's nodes draw the last two and work out nothing.
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

/** A voting round as the clock reads it. A round is open until the room moves on: it has no `endedAt`. */
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

/**
 * What the clock knows, as facts with timestamps: what `api.roundClock.get`
 * returns, or the Demo simulation's own (ADR-0003). The readings read it
 * against the browser's `now`.
 */
export interface RoundClockView {
  /** When the session began; null until anyone has had the room open since the clock existed. */
  sessionStartedAt: number | null;
  pausedAt: number | null;
  timebox: { startedAt: number; durationMs: number } | null;
  /** The length the next flip starts with. */
  timeboxMs: number;
  /** The current target's rounds, oldest first: an issue's every round, or the open Quick Vote round. */
  current: RoundFact[];
  /** The session's items in order, with each issue's title. */
  items: SessionItem[];
  /** The breaks that touch the current target or the session. */
  breaks: BreakFact[];
}

/** Time spent on rounds, and what the breaks took out of it. */
export interface TimeSplit {
  /** Voting and discussion together: the time spent. */
  ms: number;
  votingMs: number;
  discussionMs: number;
  /** The breaks left out of those stretches. */
  breakMs: number;
}

const NO_TIME: TimeSplit = Object.freeze({ ms: 0, votingMs: 0, discussionMs: 0, breakMs: 0 });

type Span = readonly [from: number, to: number];

const isOpen = (round: RoundFact): boolean => round.endedAt === undefined;

/**
 * The breaks still running, which no fact holds yet: a pause called and not
 * lifted, and the quiet past IDLE_MS since the room's last action.
 */
function liveBreaks(now: number, pausedAt: number | null, lastActivityAt: number): BreakFact[] {
  const breaks: BreakFact[] = [];
  if (pausedAt !== null && pausedAt < now) breaks.push({ from: pausedAt, to: now, kind: "pause" });
  if (now - lastActivityAt > IDLE_MS) breaks.push({ from: lastActivityAt + IDLE_MS, to: now, kind: "idle" });
  return breaks;
}

/** The view's breaks at `now`: its facts, and those still running. */
function breaksAt(view: RoundClockView, now: number, lastActivityAt: number): BreakFact[] {
  return [...view.breaks, ...liveBreaks(now, view.pausedAt, lastActivityAt)];
}

/**
 * The stretches that count as breaks, merged and in order: every pause and
 * long quiet, and the gaps in attendance of AWAY_BREAK_MS or more.
 */
function countedBreaks(breaks: readonly BreakFact[]): Span[] {
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
function roundSpans(round: RoundFact, now: number): { voting: Span; discussion: Span | null } {
  const end = round.endedAt ?? now;
  const votingEnd = round.votingEndedAt ?? round.revealedAt ?? end;
  return {
    voting: [round.startedAt, Math.max(round.startedAt, votingEnd)],
    discussion: round.revealedAt !== undefined ? [round.revealedAt, Math.max(round.revealedAt, end)] : null,
  };
}

/**
 * How rounds' time splits into voting, discussion and breaks, from `from` (a
 * session's start) to `now`. Breaks come out of whichever stretch they fall in.
 */
function roundsTime(rounds: readonly RoundFact[], breaks: readonly BreakFact[], now: number, from = -Infinity): TimeSplit {
  const counted = countedBreaks(breaks);
  const clip = (span: Span): Span => [Math.max(span[0], from), Math.min(span[1], now)];
  let votingMs = 0;
  let discussionMs = 0;
  let breakMs = 0;
  for (const round of rounds) {
    const spans = roundSpans(round, now);
    for (const [stretch, span] of [["voting", spans.voting], ["discussion", spans.discussion]] as const) {
      if (!span) continue;
      const [start, end] = clip(span);
      if (end <= start) continue;
      const paused = overlap([start, end], counted);
      if (stretch === "voting") votingMs += end - start - paused;
      else discussionMs += end - start - paused;
      breakMs += paused;
    }
  }
  return { ms: votingMs + discussionMs, votingMs, discussionMs, breakMs };
}

const sum = (a: TimeSplit, b: TimeSplit): TimeSplit => ({
  ms: a.ms + b.ms,
  votingMs: a.votingMs + b.votingMs,
  discussionMs: a.discussionMs + b.discussionMs,
  breakMs: a.breakMs + b.breakMs,
});

/**
 * The time a target's rounds took up to `now`: voting and the discussion
 * between them, less the breaks the clock leaves out. What the timer shows
 * for the current target, and so an issue's time-to-consensus at the reveal
 * that settles it (ADR-0034): the server reads it there from the facts, which
 * by then hold every break the timer counted.
 */
export function targetTime(rounds: readonly RoundFact[], breaks: readonly BreakFact[], now: number): TimeSplit {
  return roundsTime(rounds, breaks, now);
}

export type TimeboxStatus = "idle" | "running" | "over";

/** The timebox at a moment: how much is left, how far over it is, and the sand still on top. */
export interface TimeboxReading {
  status: TimeboxStatus;
  remainingMs: number;
  overtimeMs: number;
  /** The share of sand still on top. */
  fraction: number;
  /** How long ago it was flipped. */
  elapsedMs: number;
  /** When it was flipped, and for how long; null with no timebox. */
  startedAt: number | null;
  durationMs: number | null;
}

const NO_TIMEBOX: TimeboxReading = Object.freeze({
  status: "idle",
  remainingMs: 0,
  overtimeMs: 0,
  fraction: 0,
  elapsedMs: 0,
  startedAt: null,
  durationMs: null,
});

function timeboxAt(timebox: RoundClockView["timebox"], now: number): TimeboxReading {
  if (!timebox) return NO_TIMEBOX;
  // A browser whose clock runs a little behind the server's never sees more than the full length.
  const elapsedMs = Math.max(0, now - timebox.startedAt);
  const left = timebox.durationMs - elapsedMs;
  return {
    status: left > 0 ? "running" : "over",
    remainingMs: Math.max(0, left),
    overtimeMs: Math.max(0, -left),
    fraction: Math.min(1, Math.max(0, left / timebox.durationMs)),
    elapsedMs,
    startedAt: timebox.startedAt,
    durationMs: timebox.durationMs,
  };
}

/**
 * Whether the timer counts, and why not: someone paused for a break, nobody
 * has done anything for IDLE_MS, or no round is open to count.
 */
export type ClockState = "counting" | "paused" | "quiet" | "waiting";

/** What the timer shows. */
export interface TimerReading {
  /** The current target's time: its rounds, less the breaks. */
  time: TimeSplit;
  state: ClockState;
  timebox: TimeboxReading;
  /** The length the next flip starts with. */
  nextFlipMs: number;
}

/** What the timer shows at `now`, a room whose last action was at `lastActivityAt`. */
export function timerReading(view: RoundClockView | undefined, now: number, lastActivityAt: number): TimerReading {
  const current = view?.current ?? [];
  const last = current.at(-1);
  const state: ClockState =
    view?.pausedAt != null
      ? "paused"
      : !last || !isOpen(last)
        ? "waiting"
        : now - lastActivityAt > IDLE_MS
          ? "quiet"
          : "counting";
  return {
    time: view ? targetTime(current, breaksAt(view, now, lastActivityAt), now) : NO_TIME,
    state,
    timebox: timeboxAt(view?.timebox ?? null, now),
    nextFlipMs: view?.timeboxMs ?? DEFAULT_TIMEBOX_MS,
  };
}

/** One of the session's items as session time draws it. */
export interface SessionItemReading {
  issueId?: Id<"issues">;
  /** The issue's title; none for a Quick Vote. */
  title?: string;
  /** When its first round started: a key that stays put. */
  startedAt: number;
  rounds: number;
  time: TimeSplit;
  /** The room is still on it. Drawn even before it has counted any time. */
  open: boolean;
}

/** What session time shows. */
export interface SessionReading {
  /** The items that took time, and the open one. */
  items: SessionItemReading[];
  total: TimeSplit;
  /** How many of the items are issues, and how many Quick Vote rounds. */
  tickets: number;
  quickVotes: number;
  paused: boolean;
}

/** What session time shows at `now`, a room whose last action was at `lastActivityAt`. */
export function sessionReading(view: RoundClockView | undefined, now: number, lastActivityAt: number): SessionReading {
  if (!view) return { items: [], total: NO_TIME, tickets: 0, quickVotes: 0, paused: false };
  const breaks = breaksAt(view, now, lastActivityAt);
  const from = view.sessionStartedAt ?? -Infinity;
  const lastIndex = view.items.length - 1;
  const items = view.items.flatMap((item, index): SessionItemReading[] => {
    const first = item.rounds[0];
    const last = item.rounds.at(-1);
    if (!first || !last) return [];
    const time = roundsTime(item.rounds, breaks, now, from);
    const open = index === lastIndex && isOpen(last);
    if (time.ms === 0 && !open) return [];
    return [
      {
        ...(item.issueId !== undefined && { issueId: item.issueId }),
        ...(item.title !== undefined && { title: item.title }),
        startedAt: first.startedAt,
        rounds: item.rounds.length,
        time,
        open,
      },
    ];
  });
  const tickets = items.filter((item) => item.issueId !== undefined).length;
  return {
    items,
    total: items.reduce((total, item) => sum(total, item.time), NO_TIME),
    tickets,
    quickVotes: items.length - tickets,
    paused: view.pausedAt !== null,
  };
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
