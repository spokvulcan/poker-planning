import { describe, it, expect } from "vitest";
import {
  agreementTrend,
  velocityByDay,
  voteDistribution,
  participationStats,
  timeToConsensus,
  voterAlignment,
  predictability,
  dashboardSummary,
  sessionIssueStats,
  type HistoryIssue,
  type HistoryVote,
  type RoomIssue,
  type RoomIssues,
} from "./analyticsMath";

// Deterministic UTC timestamps → stable ISO days.
const DAY1 = Date.UTC(2026, 0, 10, 12); // "2026-01-10"
const DAY2 = Date.UTC(2026, 0, 11, 12); // "2026-01-11"
const DAY3 = Date.UTC(2026, 0, 12, 12); // "2026-01-12"

function issue(over: Partial<HistoryIssue> = {}): HistoryIssue {
  return { title: "Issue", votedAt: DAY1, ...over };
}

function entry(roomName: string, i: HistoryIssue, roomId = roomName): RoomIssue {
  return { roomId, roomName, issue: i };
}

describe("agreementTrend", () => {
  it("maps issues with an agreement to points sorted by timestamp", () => {
    const points = agreementTrend([
      entry("B", issue({ title: "later", votedAt: DAY2, voteStats: { agreement: 60 } })),
      entry("A", issue({ title: "earlier", votedAt: DAY1, voteStats: { agreement: 80 } })),
    ]);
    expect(points).toEqual([
      { date: "2026-01-10", timestamp: DAY1, agreement: 80, issueTitle: "earlier", roomName: "A" },
      { date: "2026-01-11", timestamp: DAY2, agreement: 60, issueTitle: "later", roomName: "B" },
    ]);
  });

  it("skips issues without a votedAt or an agreement", () => {
    const points = agreementTrend([
      entry("A", issue({ votedAt: undefined, voteStats: { agreement: 80 } })),
      entry("A", issue({ voteStats: undefined })),
    ]);
    expect(points).toEqual([]);
  });

  it("returns a defined empty result for empty history", () => {
    expect(agreementTrend([])).toEqual([]);
  });
});

describe("velocityByDay", () => {
  it("buckets story points and issue counts by day", () => {
    const points = velocityByDay([
      entry("A", issue({ finalEstimate: "5", votedAt: DAY1 })),
      entry("B", issue({ finalEstimate: "3", votedAt: DAY1 })),
      entry("A", issue({ finalEstimate: "8", votedAt: DAY2 })),
    ]);
    expect(points).toEqual([
      { date: "2026-01-10", storyPoints: 8, issueCount: 2 },
      { date: "2026-01-11", storyPoints: 8, issueCount: 1 },
    ]);
  });

  it("skips non-numeric estimates, missing estimates, and missing votedAt", () => {
    const points = velocityByDay([
      entry("A", issue({ finalEstimate: "M" })), // non-numeric scale card
      entry("A", issue({ finalEstimate: undefined })),
      entry("A", issue({ finalEstimate: "5", votedAt: undefined })),
    ]);
    expect(points).toEqual([]);
  });

  it("returns a defined empty result for empty history", () => {
    expect(velocityByDay([])).toEqual([]);
  });
});

describe("voteDistribution", () => {
  it("counts estimates with percentages, sorted by count descending", () => {
    const dist = voteDistribution([
      issue({ finalEstimate: "5" }),
      issue({ finalEstimate: "5" }),
      issue({ finalEstimate: "3" }),
      issue({ finalEstimate: "M" }),
      issue({ finalEstimate: undefined }),
    ]);
    expect(dist).toEqual([
      { value: "5", count: 2, percentage: 50 },
      { value: "3", count: 1, percentage: 25 },
      { value: "M", count: 1, percentage: 25 },
    ]);
  });

  it("counts whatever history it is given — the aggregate owns the window", () => {
    // The old inline code leaked issues without a votedAt into RANGED results.
    // Range filtering now happens once in completedIssueHistory, so a
    // votedAt-less row simply never reaches this projection on a ranged call;
    // on an unranged call it is legitimately part of the history and counted.
    const dist = voteDistribution([issue({ finalEstimate: "5", votedAt: undefined })]);
    expect(dist).toEqual([{ value: "5", count: 1, percentage: 100 }]);
  });

  it("returns a defined empty result for empty history", () => {
    expect(voteDistribution([])).toEqual([]);
  });
});

describe("participationStats", () => {
  it("averages real votes cast per session, rounded", () => {
    expect(participationStats({ totalSessions: 3, totalIssuesVoted: 3, totalVotesCast: 10 }))
      .toEqual({ totalSessions: 3, totalIssuesVoted: 3, totalVotesCast: 10, averageVotesPerSession: 3 });
  });

  it("votes cast can exceed issues voted (several voters per issue)", () => {
    // The fake old counter made these two equal by construction.
    const stats = participationStats({ totalSessions: 1, totalIssuesVoted: 2, totalVotesCast: 5 });
    expect(stats.totalVotesCast).toBe(5);
    expect(stats.averageVotesPerSession).toBe(5);
  });

  it("returns zeros for empty history", () => {
    expect(participationStats({ totalSessions: 0, totalIssuesVoted: 0, totalVotesCast: 0 }))
      .toEqual({ totalSessions: 0, totalIssuesVoted: 0, totalVotesCast: 0, averageVotesPerSession: 0 });
  });
});

describe("timeToConsensus", () => {
  const withTime = (durationMs: number, over: Partial<HistoryIssue> = {}): HistoryIssue =>
    issue({ votedAt: DAY1, voteStats: { agreement: 80, timeToConsensusMs: durationMs }, ...over });

  it("computes rounded average and median", () => {
    const stats = timeToConsensus([
      entry("A", withTime(100)),
      entry("A", withTime(200)),
      entry("A", withTime(400)),
    ]);
    expect(stats.averageMs).toBe(233);
    expect(stats.medianMs).toBe(200);
  });

  it("averages the two middle durations for an even count", () => {
    const stats = timeToConsensus([entry("A", withTime(100)), entry("A", withTime(200))]);
    expect(stats.medianMs).toBe(150);
  });

  it("flags outliers beyond 2x the average, sorted by duration, capped at 10", () => {
    const entries = [
      ...Array.from({ length: 50 }, () => entry("A", withTime(1))),
      ...Array.from({ length: 11 }, () => entry("A", withTime(10))),
    ];
    const stats = timeToConsensus(entries);
    // average ≈ 2.62 → 2x ≈ 5.25 → the eleven 10s are outliers, capped to 10.
    expect(stats.outliers).toHaveLength(10);
    expect(stats.outliers[0]).toMatchObject({ durationMs: 10, multiplierVsAverage: 3.8 });
  });

  it("groups the trend by room+date with rounded averages", () => {
    const stats = timeToConsensus([
      entry("A", withTime(100)),
      entry("A", withTime(300)),
      entry("B", withTime(50)),
      entry("A", withTime(900, { votedAt: DAY2 })),
    ]);
    expect(stats.trendBySession).toEqual([
      { date: "2026-01-10", roomName: "A", averageMs: 200 },
      { date: "2026-01-10", roomName: "B", averageMs: 50 },
      { date: "2026-01-11", roomName: "A", averageMs: 900 },
    ]);
  });

  it("skips issues without a duration or votedAt", () => {
    const stats = timeToConsensus([
      entry("A", issue({ voteStats: { agreement: 80 } })),
      entry("A", withTime(100, { votedAt: undefined })),
    ]);
    expect(stats).toEqual({ averageMs: null, medianMs: null, outliers: [], trendBySession: [] });
  });

  it("returns nulls and empty lists for empty history", () => {
    expect(timeToConsensus([])).toEqual({
      averageMs: null,
      medianMs: null,
      outliers: [],
      trendBySession: [],
    });
  });
});

describe("voterAlignment", () => {
  function vote(over: Partial<HistoryVote> = {}): HistoryVote {
    return {
      userId: "u1",
      cardLabel: "5",
      consensusLabel: "5",
      deltaSteps: 0,
      votedAt: DAY1,
      ...over,
    };
  }

  it("computes agreement rate, average delta, and consistency per user", () => {
    const data = voterAlignment(
      [
        vote({ cardLabel: "5", consensusLabel: "5", deltaSteps: 0 }),
        vote({ cardLabel: "3", consensusLabel: "5", deltaSteps: -1 }),
        vote({ cardLabel: "8", consensusLabel: "5", deltaSteps: 1 }),
      ],
      { u1: "Ada" }
    );
    expect(data.users).toEqual([
      {
        userId: "u1",
        userName: "Ada",
        totalVotes: 3,
        agreesWithConsensus: 1,
        agreementRate: 33,
        averageDelta: 0,
        tendency: "aligned",
      },
    ]);
    expect(data.scatterPoints).toEqual([{ userId: "u1", userName: "Ada", x: 0, y: 0.82 }]);
  });

  it("classifies under/over estimators by average delta beyond ±0.5", () => {
    const data = voterAlignment(
      [
        vote({ userId: "low", deltaSteps: -2 }),
        vote({ userId: "low", deltaSteps: -1 }),
        vote({ userId: "high", deltaSteps: 2 }),
        vote({ userId: "high", deltaSteps: 1 }),
      ],
      {}
    );
    expect(data.users.find((u) => u.userId === "low")).toMatchObject({
      averageDelta: -1.5,
      tendency: "under",
    });
    expect(data.users.find((u) => u.userId === "high")).toMatchObject({
      averageDelta: 1.5,
      tendency: "over",
    });
  });

  it("marks users without delta data as unknown and excludes them from the scatter", () => {
    const data = voterAlignment(
      [
        vote({ userId: "u1", deltaSteps: 1 }),
        vote({ userId: "u2", deltaSteps: undefined, cardLabel: "M", consensusLabel: "M" }),
      ],
      { u1: "Ada", u2: "Bob" }
    );
    expect(data.users.find((u) => u.userId === "u2")).toMatchObject({
      averageDelta: null,
      tendency: "unknown",
      agreementRate: 100,
    });
    expect(data.scatterPoints.map((p) => p.userId)).toEqual(["u1"]);
  });

  it("sorts users and scatter points by total votes descending", () => {
    const data = voterAlignment(
      [
        vote({ userId: "u1", deltaSteps: 0 }),
        vote({ userId: "u2", deltaSteps: 0 }),
        vote({ userId: "u2", deltaSteps: 0 }),
      ],
      {}
    );
    expect(data.users.map((u) => u.userId)).toEqual(["u2", "u1"]);
    expect(data.scatterPoints.map((p) => p.userId)).toEqual(["u2", "u1"]);
  });

  it("falls back to 'Unknown' for unresolved user names", () => {
    const data = voterAlignment([vote({ userId: "ghost" })], {});
    expect(data.users[0].userName).toBe("Unknown");
  });

  it("votes without a consensus label never count as agreeing", () => {
    const data = voterAlignment([vote({ consensusLabel: undefined })], {});
    expect(data.users[0].agreesWithConsensus).toBe(0);
    expect(data.users[0].agreementRate).toBe(0);
  });

  it("returns a defined empty result for empty history", () => {
    expect(voterAlignment([], {})).toEqual({ users: [], scatterPoints: [] });
  });
});

describe("predictability", () => {
  function room(roomName: string, issues: HistoryIssue[]): RoomIssues {
    return { roomId: roomName, roomName, issues };
  }

  function scored(
    estimate: string,
    votedAt: number,
    agreement?: number,
    timeToConsensusMs?: number
  ): HistoryIssue {
    return issue({
      finalEstimate: estimate,
      votedAt,
      voteStats:
        agreement !== undefined || timeToConsensusMs !== undefined
          ? {
              agreement: agreement ?? 0,
              ...(timeToConsensusMs !== undefined ? { timeToConsensusMs } : {}),
            }
          : undefined,
    });
  }

  it("scores 88 for perfectly consistent velocity at 80% agreement", () => {
    const data = predictability([
      room("A", [scored("10", DAY1, 80)]),
      room("B", [scored("10", DAY2, 80)]),
      room("C", [scored("10", DAY3, 80)]),
    ]);
    // consistency = 1 - 0/10 = 1 → 80*0.6 + 100*0.4 = 88
    expect(data.predictabilityScore).toBe(88);
    expect(data.averageVelocityPerSession).toBe(10);
    expect(data.velocityTrend).toBe("stable");
    expect(data.averageAgreement).toBe(80);
    expect(data.agreementTrend).toBe("stable");
  });

  it("returns a null score with fewer than 3 sessions with story points", () => {
    const data = predictability([
      room("A", [scored("10", DAY1, 80)]),
      room("B", [scored("10", DAY2, 80)]),
      room("C", [scored("M", DAY3, 80)]), // non-numeric scale → no points
    ]);
    expect(data.predictabilityScore).toBeNull();
    expect(data.sessions).toHaveLength(3);
    expect(data.sessions.find((s) => s.roomName === "C")).toMatchObject({
      estimatedPoints: 0,
      issueCount: 1,
    });
  });

  it("clamps the score at 0 when velocity is wildly inconsistent", () => {
    const data = predictability([
      room("A", [scored("1", DAY1)]),
      room("B", [scored("100", DAY2)]),
      room("C", [scored("1", DAY3)]),
    ]);
    expect(data.predictabilityScore).toBe(0);
  });

  it("clamps the score at 100", () => {
    const data = predictability([
      room("A", [scored("10", DAY1, 100)]),
      room("B", [scored("10", DAY2, 100)]),
      room("C", [scored("10", DAY3, 100)]),
    ]);
    expect(data.predictabilityScore).toBe(100);
  });

  it("detects increasing and decreasing velocity trends (>10% half-over-half)", () => {
    const increasing = predictability([
      room("A", [scored("10", DAY1, 80)]),
      room("B", [scored("10", DAY1, 80)]),
      room("C", [scored("20", DAY3, 80)]),
      room("D", [scored("20", DAY3, 80)]),
    ]);
    expect(increasing.velocityTrend).toBe("increasing");

    const decreasing = predictability([
      room("A", [scored("20", DAY1, 80)]),
      room("B", [scored("20", DAY1, 80)]),
      room("C", [scored("10", DAY3, 80)]),
      room("D", [scored("10", DAY3, 80)]),
    ]);
    expect(decreasing.velocityTrend).toBe("decreasing");
  });

  it("detects improving and declining agreement trends (>5% half-over-half)", () => {
    const improving = predictability([
      room("A", [scored("10", DAY1, 60)]),
      room("B", [scored("10", DAY2, 90)]),
    ]);
    expect(improving.agreementTrend).toBe("improving");

    const declining = predictability([
      room("A", [scored("10", DAY1, 90)]),
      room("B", [scored("10", DAY2, 60)]),
    ]);
    expect(declining.agreementTrend).toBe("declining");
  });

  it("rolls one session per room with sums, rounded averages, and latest-day date", () => {
    const data = predictability([
      room("A", [
        scored("5", DAY1, 80, 100),
        scored("3", DAY2, 60, 300),
        issue({ finalEstimate: "13", votedAt: undefined }), // unusable — no votedAt
      ]),
    ]);
    expect(data.sessions).toEqual([
      {
        roomName: "A",
        date: "2026-01-11",
        estimatedPoints: 8,
        issueCount: 2,
        averageAgreement: 70,
        averageTimeToConsensus: 200,
      },
    ]);
  });

  it("drops rooms with no usable issues and sorts sessions by date", () => {
    const data = predictability([
      room("empty", [issue({ votedAt: undefined, finalEstimate: "5" })]),
      room("B", [scored("5", DAY2, 80)]),
      room("A", [scored("5", DAY1, 80)]),
    ]);
    expect(data.sessions.map((s) => s.roomName)).toEqual(["A", "B"]);
  });

  it("returns a defined empty-ish result for empty history", () => {
    expect(predictability([])).toEqual({
      predictabilityScore: null,
      sessions: [],
      averageVelocityPerSession: 0,
      velocityTrend: "stable",
      averageAgreement: 0,
      agreementTrend: "stable",
    });
  });
});

describe("dashboardSummary", () => {
  it("sums sessions, points, and rounds average agreement", () => {
    expect(
      dashboardSummary([
        { issuesCompleted: 2, totalStoryPoints: 8, averageAgreement: 80 },
        { issuesCompleted: 1, totalStoryPoints: null, averageAgreement: null },
        { issuesCompleted: 3, totalStoryPoints: 5, averageAgreement: 61 },
      ])
    ).toEqual({
      totalSessions: 3,
      totalIssuesEstimated: 6,
      totalStoryPoints: 13,
      averageAgreement: 71,
    });
  });

  it("returns nulls when no session has points or agreement", () => {
    expect(
      dashboardSummary([{ issuesCompleted: 0, totalStoryPoints: null, averageAgreement: null }])
    ).toEqual({
      totalSessions: 1,
      totalIssuesEstimated: 0,
      totalStoryPoints: null,
      averageAgreement: null,
    });
  });

  it("returns a defined zeroed result for empty history", () => {
    expect(dashboardSummary([])).toEqual({
      totalSessions: 0,
      totalIssuesEstimated: 0,
      totalStoryPoints: null,
      averageAgreement: null,
    });
  });
});

describe("sessionIssueStats", () => {
  it("sums numeric estimates and rounds average agreement", () => {
    expect(
      sessionIssueStats([
        issue({ finalEstimate: "5", voteStats: { agreement: 80 } }),
        issue({ finalEstimate: "3", voteStats: { agreement: 60 } }),
      ])
    ).toEqual({ issuesCompleted: 2, totalStoryPoints: 8, averageAgreement: 70 });
  });

  it("reports null points for a fully non-numeric scale", () => {
    expect(sessionIssueStats([issue({ finalEstimate: "M" })]).totalStoryPoints).toBeNull();
  });

  it("reports null agreement when no issue has one", () => {
    expect(sessionIssueStats([issue({})]).averageAgreement).toBeNull();
  });
});
