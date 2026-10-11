import { describe, expect, it } from "vitest";
import {
  AWAY_BREAK_MS,
  IDLE_MS,
  clockText,
  countdownText,
  countedBreaks,
  liveBreaks,
  roundsTime,
  sessionItems,
  timeboxAt,
  type RoundFact,
} from "./roundTime";
import type { Id } from "./_generated/dataModel";

// The one reading of the round clock's facts (ADR-0032): which stretches
// count as breaks, and how a round's time splits into voting and discussion.

const MIN = 60_000;
const issue = (n: number) => `issue-${n}` as Id<"issues">;

describe("breaks", () => {
  it("count a pause and a long quiet always, and a gap nobody was there only from ten minutes", () => {
    expect(
      countedBreaks([
        { from: 0, to: 5 * MIN, kind: "away" },
        { from: 20 * MIN, to: 20 * MIN + AWAY_BREAK_MS, kind: "away" },
        { from: 40 * MIN, to: 41 * MIN, kind: "pause" },
        { from: 50 * MIN, to: 51 * MIN, kind: "idle" },
      ])
    ).toEqual([
      [20 * MIN, 30 * MIN],
      [40 * MIN, 41 * MIN],
      [50 * MIN, 51 * MIN],
    ]);
  });

  it("merge where they overlap", () => {
    expect(
      countedBreaks([
        { from: 10 * MIN, to: 30 * MIN, kind: "away" },
        { from: 0, to: 15 * MIN, kind: "pause" },
      ])
    ).toEqual([[0, 30 * MIN]]);
  });

  it("still running are a pause not yet lifted and the quiet past twenty minutes", () => {
    expect(liveBreaks(60 * MIN, { pausedAt: 50 * MIN, lastActivityAt: 30 * MIN })).toEqual([
      { from: 50 * MIN, to: 60 * MIN, kind: "pause" },
      { from: 30 * MIN + IDLE_MS, to: 60 * MIN, kind: "idle" },
    ]);
    expect(liveBreaks(60 * MIN, { lastActivityAt: 59 * MIN })).toEqual([]);
  });
});

describe("a round's time", () => {
  const round: RoundFact = { startedAt: 0, votingEndedAt: 2 * MIN, revealedAt: 2 * MIN, endedAt: 7 * MIN };

  it("splits at the reveal into voting and discussion", () => {
    expect(roundsTime([round], [], 10 * MIN)).toEqual({ votingMs: 2 * MIN, discussionMs: 5 * MIN, breakMs: 0 });
  });

  it("leaves breaks out of whichever stretch they fall in", () => {
    const pause = { from: 3 * MIN, to: 4 * MIN, kind: "pause" as const };
    expect(roundsTime([round], [pause], 10 * MIN)).toEqual({ votingMs: 2 * MIN, discussionMs: 4 * MIN, breakMs: MIN });
  });

  it("runs an open round up to now, and a session counts only from its start", () => {
    const open: RoundFact = { startedAt: 0, revealedAt: 4 * MIN };
    expect(roundsTime([open], [], 6 * MIN)).toEqual({ votingMs: 4 * MIN, discussionMs: 2 * MIN, breakMs: 0 });
    expect(roundsTime([open], [], 6 * MIN, { from: 3 * MIN })).toEqual({ votingMs: MIN, discussionMs: 2 * MIN, breakMs: 0 });
  });

  it("of a round ended unrevealed is all voting", () => {
    expect(roundsTime([{ startedAt: 0, votingEndedAt: 3 * MIN, endedAt: 3 * MIN }], [], 10 * MIN)).toEqual({
      votingMs: 3 * MIN,
      discussionMs: 0,
      breakMs: 0,
    });
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

describe("the timebox", () => {
  const timebox = { startedAt: 0, durationMs: 2 * MIN };

  it("runs down, then counts how far over it is", () => {
    expect(timeboxAt(timebox, 30_000)).toEqual({ status: "running", remainingMs: 90_000, overtimeMs: 0, fraction: 0.75 });
    expect(timeboxAt(timebox, 3 * MIN)).toEqual({ status: "over", remainingMs: 0, overtimeMs: MIN, fraction: 0 });
    expect(timeboxAt(null, 0).status).toBe("idle");
  });

  it("never shows more than its full length to a browser whose clock runs behind", () => {
    expect(timeboxAt(timebox, -5_000)).toMatchObject({ remainingMs: 2 * MIN, fraction: 1 });
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
