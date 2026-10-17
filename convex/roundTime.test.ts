import { describe, expect, it } from "vitest";
import {
  AWAY_BREAK_MS,
  DEFAULT_TIMEBOX_MS,
  IDLE_MS,
  clockText,
  countdownText,
  sessionItems,
  sessionReading,
  targetTime,
  timerReading,
  type RoundClockView,
  type RoundFact,
} from "./roundTime";
import type { Id } from "./_generated/dataModel";

// The one reading of the round clock's facts (ADR-0032): which stretches
// count as breaks, how a target's time splits into voting and discussion,
// and what the timer and session time show of it.

const MIN = 60_000;
const issue = (n: number) => `issue-${n}` as Id<"issues">;

function view(over: Partial<RoundClockView> = {}): RoundClockView {
  return {
    sessionStartedAt: null,
    pausedAt: null,
    timebox: null,
    timeboxMs: DEFAULT_TIMEBOX_MS,
    current: [],
    items: [],
    breaks: [],
    ...over,
  };
}

describe("a target's time", () => {
  const round: RoundFact = { startedAt: 0, votingEndedAt: 2 * MIN, revealedAt: 2 * MIN, endedAt: 7 * MIN };

  it("splits at the reveal into voting and discussion", () => {
    expect(targetTime([round], [], 10 * MIN)).toEqual({ ms: 7 * MIN, votingMs: 2 * MIN, discussionMs: 5 * MIN, breakMs: 0 });
  });

  it("counts every round, voting and the discussion between them", () => {
    const again: RoundFact = { startedAt: 7 * MIN, votingEndedAt: 9 * MIN, revealedAt: 9 * MIN };
    expect(targetTime([round, again], [], 9 * MIN)).toMatchObject({ ms: 9 * MIN, votingMs: 4 * MIN, discussionMs: 5 * MIN });
  });

  it("leaves breaks out of whichever stretch they fall in", () => {
    const pause = { from: 3 * MIN, to: 4 * MIN, kind: "pause" as const };
    expect(targetTime([round], [pause], 10 * MIN)).toEqual({ ms: 6 * MIN, votingMs: 2 * MIN, discussionMs: 4 * MIN, breakMs: MIN });
  });

  it("leaves out a pause and a long quiet always, and a gap nobody was there only from ten minutes", () => {
    const open: RoundFact = { startedAt: 0 };
    const time = targetTime(
      [open],
      [
        { from: 0, to: 5 * MIN, kind: "away" },
        { from: 20 * MIN, to: 20 * MIN + AWAY_BREAK_MS, kind: "away" },
        { from: 40 * MIN, to: 41 * MIN, kind: "pause" },
        { from: 50 * MIN, to: 51 * MIN, kind: "idle" },
      ],
      60 * MIN
    );
    expect(time).toMatchObject({ ms: 48 * MIN, breakMs: 12 * MIN });
  });

  it("leaves out breaks that overlap once", () => {
    const open: RoundFact = { startedAt: 0 };
    const time = targetTime(
      [open],
      [
        { from: 10 * MIN, to: 30 * MIN, kind: "away" },
        { from: 0, to: 15 * MIN, kind: "pause" },
      ],
      40 * MIN
    );
    expect(time).toMatchObject({ ms: 10 * MIN, breakMs: 30 * MIN });
  });

  it("runs an open round up to now, and is all voting for a round ended unrevealed", () => {
    expect(targetTime([{ startedAt: 0, revealedAt: 4 * MIN }], [], 6 * MIN)).toMatchObject({
      votingMs: 4 * MIN,
      discussionMs: 2 * MIN,
    });
    expect(targetTime([{ startedAt: 0, votingEndedAt: 3 * MIN, endedAt: 3 * MIN }], [], 10 * MIN)).toEqual({
      ms: 3 * MIN,
      votingMs: 3 * MIN,
      discussionMs: 0,
      breakMs: 0,
    });
  });
});

describe("what the timer shows", () => {
  const open = view({ current: [{ startedAt: 0 }] });

  it("counts the current target's time while a round is open and someone is doing something", () => {
    expect(timerReading(open, 5 * MIN, 4 * MIN)).toMatchObject({ state: "counting", time: { ms: 5 * MIN } });
  });

  it("stops at a pause, which counts as a break until it is lifted", () => {
    expect(timerReading({ ...open, pausedAt: 5 * MIN }, 9 * MIN, 5 * MIN)).toMatchObject({
      state: "paused",
      time: { ms: 5 * MIN, breakMs: 4 * MIN },
    });
  });

  it("goes quiet twenty minutes after the room's last action, and leaves the rest of the quiet out", () => {
    expect(timerReading(open, 30 * MIN, 5 * MIN)).toMatchObject({ state: "quiet", time: { ms: 5 * MIN + IDLE_MS } });
    expect(timerReading(open, 5 * MIN + IDLE_MS, 5 * MIN).state).toBe("counting");
  });

  it("waits while no round is open: none yet, or the target's last one ended", () => {
    expect(timerReading(view(), 0, 0)).toMatchObject({ state: "waiting", time: { ms: 0 } });
    expect(timerReading(view({ current: [{ startedAt: 0, endedAt: 2 * MIN }] }), 5 * MIN, 5 * MIN)).toMatchObject({
      state: "waiting",
      time: { ms: 2 * MIN },
    });
  });

  it("reads nothing, and offers the default flip, before the clock has loaded", () => {
    expect(timerReading(undefined, 0, 0)).toEqual({
      time: { ms: 0, votingMs: 0, discussionMs: 0, breakMs: 0 },
      state: "waiting",
      timebox: { status: "idle", remainingMs: 0, overtimeMs: 0, fraction: 0, elapsedMs: 0, startedAt: null, durationMs: null },
      nextFlipMs: DEFAULT_TIMEBOX_MS,
    });
  });

  it("runs the timebox down, then counts how far over it is, and flips next for the room's last length", () => {
    const flipped = view({ timebox: { startedAt: 0, durationMs: 2 * MIN }, timeboxMs: 2 * MIN });
    expect(timerReading(flipped, 30_000, 0).timebox).toEqual({
      status: "running",
      remainingMs: 90_000,
      overtimeMs: 0,
      fraction: 0.75,
      elapsedMs: 30_000,
      startedAt: 0,
      durationMs: 2 * MIN,
    });
    expect(timerReading(flipped, 3 * MIN, 0).timebox).toMatchObject({ status: "over", remainingMs: 0, overtimeMs: MIN, fraction: 0 });
    expect(timerReading(view({ timeboxMs: 3 * MIN }), 0, 0).nextFlipMs).toBe(3 * MIN);
  });

  it("never shows more than a timebox's full length to a browser whose clock runs behind", () => {
    const flipped = view({ timebox: { startedAt: 5_000, durationMs: 2 * MIN } });
    expect(timerReading(flipped, 0, 0).timebox).toMatchObject({ remainingMs: 2 * MIN, fraction: 1, elapsedMs: 0 });
  });
});

describe("what session time shows", () => {
  const START = 60 * MIN;
  const ticket = {
    issueId: issue(1),
    title: "Checkout flow",
    rounds: [{ issueId: issue(1), startedAt: START, votingEndedAt: START + 2 * MIN, revealedAt: START + 2 * MIN, endedAt: START + 20 * MIN }],
  };
  const quickVote = { rounds: [{ startedAt: START + 20 * MIN, votingEndedAt: START + 25 * MIN, endedAt: START + 25 * MIN }] };

  it("splits each item's time, totals them, and tallies tickets and Quick Vote rounds", () => {
    const session = sessionReading(
      view({ sessionStartedAt: START, items: [ticket, quickVote], breaks: [{ from: START + 5 * MIN, to: START + 17 * MIN, kind: "away" }] }),
      START + 30 * MIN,
      START + 30 * MIN
    );
    expect(session.items.map((item) => [item.title ?? null, item.time.ms, item.rounds, item.open])).toEqual([
      ["Checkout flow", 8 * MIN, 1, false],
      [null, 5 * MIN, 1, false],
    ]);
    expect(session.total).toEqual({ ms: 13 * MIN, votingMs: 7 * MIN, discussionMs: 6 * MIN, breakMs: 12 * MIN });
    expect([session.tickets, session.quickVotes, session.paused]).toEqual([1, 1, false]);
  });

  it("counts only from the session's start", () => {
    const session = sessionReading(view({ sessionStartedAt: START + 10 * MIN, items: [ticket] }), START + 30 * MIN, START + 30 * MIN);
    expect(session.total.ms).toBe(10 * MIN);
  });

  it("draws the item the room is on even before it has counted any time, and marks only that one open", () => {
    const paused = { rounds: [{ startedAt: START + 25 * MIN }] };
    const session = sessionReading(
      view({ sessionStartedAt: START, items: [ticket, paused], pausedAt: START + 25 * MIN }),
      START + 30 * MIN,
      START + 25 * MIN
    );
    expect(session.items.map((item) => [item.title ?? null, item.time.ms, item.open])).toEqual([
      ["Checkout flow", 20 * MIN, false],
      [null, 0, true],
    ]);
    expect([session.tickets, session.quickVotes, session.paused]).toEqual([1, 1, true]);
  });

  it("leaves out an item that took no time and isn't open", () => {
    const before = { rounds: [{ startedAt: START - 10 * MIN, endedAt: START - 5 * MIN, votingEndedAt: START - 5 * MIN }] };
    const session = sessionReading(view({ sessionStartedAt: START, items: [before, ticket] }), START + 30 * MIN, START + 30 * MIN);
    expect(session.items.map((item) => item.title)).toEqual(["Checkout flow"]);
  });

  it("is empty before the clock has loaded", () => {
    expect(sessionReading(undefined, 0, 0)).toMatchObject({ items: [], total: { ms: 0 }, tickets: 0, quickVotes: 0, paused: false });
  });
});

describe("a session's items", () => {
  it("group an issue's consecutive rounds, and keep each Quick Vote round alone", () => {
    const items = sessionItems([
      { startedAt: 0 },
      { startedAt: 1, issueId: issue(1) },
      { startedAt: 2, issueId: issue(1) },
      { startedAt: 3 },
      { startedAt: 4 },
      { startedAt: 5, issueId: issue(2) },
    ]);
    expect(items.map((item) => [item.issueId ?? null, item.rounds.length])).toEqual([
      [null, 1],
      [issue(1), 2],
      [null, 1],
      [null, 1],
      [issue(2), 1],
    ]);
  });
});

describe("clock text", () => {
  it("reads m:ss under an hour and h:mm:ss from an hour on, never negative", () => {
    expect(clockText(65_000)).toBe("1:05");
    expect(clockText(2 * 60 * MIN + 5_000)).toBe("2:00:05");
    expect(clockText(-500)).toBe("0:00");
  });

  it("counts down in whole seconds rounded up", () => {
    expect(countdownText(119_001)).toBe("2:00");
    expect(countdownText(0)).toBe("0:00");
  });
});
