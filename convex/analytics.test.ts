/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

// Deterministic UTC timestamps: IN lands inside RANGE, OUT outside it.
const IN = Date.UTC(2026, 0, 10, 12); // 2026-01-10
const OUT = Date.UTC(2026, 1, 10, 12); // 2026-02-10
const RANGE = { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 0, 31, 23, 59, 59) };

async function seedUser(t: T, authUserId: string, name = "U"): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", { authUserId, name, createdAt: Date.now() })
  );
}

async function seedRoom(t: T, name = "R"): Promise<Id<"rooms">> {
  return t.run((ctx) =>
    ctx.db.insert("rooms", {
      name,
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    })
  );
}

async function addMembership(
  t: T,
  roomId: Id<"rooms">,
  userId: Id<"users">,
  joinedAt: number
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("roomMemberships", { roomId, userId, isSpectator: false, joinedAt })
  );
}

async function seedIssue(
  t: T,
  roomId: Id<"rooms">,
  opts: {
    sequentialId: number;
    status?: "pending" | "voting" | "completed";
    votedAt?: number;
    finalEstimate?: string;
    voteStats?: { agreement: number; voteCount: number; timeToConsensusMs?: number };
  }
): Promise<Id<"issues">> {
  return t.run((ctx) =>
    ctx.db.insert("issues", {
      roomId,
      sequentialId: opts.sequentialId,
      title: `Issue ${opts.sequentialId}`,
      status: opts.status ?? "completed",
      ...(opts.votedAt !== undefined ? { votedAt: opts.votedAt } : {}),
      ...(opts.finalEstimate !== undefined ? { finalEstimate: opts.finalEstimate } : {}),
      ...(opts.voteStats !== undefined ? { voteStats: opts.voteStats } : {}),
      createdAt: Date.now(),
      order: opts.sequentialId,
    })
  );
}

async function seedVote(
  t: T,
  opts: {
    roomId: Id<"rooms">;
    issueId: Id<"issues">;
    userId: Id<"users">;
    cardLabel: string;
    consensusLabel?: string;
    deltaSteps?: number;
    votedAt: number;
  }
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("individualVotes", {
      roomId: opts.roomId,
      issueId: opts.issueId,
      userId: opts.userId,
      cardLabel: opts.cardLabel,
      ...(opts.consensusLabel !== undefined ? { consensusLabel: opts.consensusLabel } : {}),
      ...(opts.deltaSteps !== undefined ? { deltaSteps: opts.deltaSteps } : {}),
      votedAt: opts.votedAt,
    })
  );
}

/** A user with one room holding a mix of completed issues in/out of RANGE. */
async function seedMixedHistory(t: T) {
  const userId = await seedUser(t, "auth-a");
  const roomId = await seedRoom(t);
  await addMembership(t, roomId, userId, IN);
  const inRange = await seedIssue(t, roomId, {
    sequentialId: 1,
    votedAt: IN,
    finalEstimate: "5",
    voteStats: { agreement: 80, voteCount: 2 },
  });
  await seedIssue(t, roomId, { sequentialId: 2, votedAt: OUT, finalEstimate: "8" });
  await seedIssue(t, roomId, { sequentialId: 3, finalEstimate: "13" }); // no votedAt
  await seedIssue(t, roomId, { sequentialId: 4, status: "voting" });
  return { userId, roomId, inRange };
}

describe("completedIssueHistory — range semantics through the registered queries", () => {
  it("windows issues on issue.votedAt: in-range kept, out-of-range and votedAt-less dropped", async () => {
    const t = convexTest(schema, modules);
    await seedMixedHistory(t);
    const asA = t.withIdentity({ subject: "auth-a" });

    expect(await asA.query(api.analytics.getVelocityStats, { dateRange: RANGE })).toEqual([
      { date: "2026-01-10", storyPoints: 5, issueCount: 1 },
    ]);

    // Without a range every completed issue is history (the votedAt-less one
    // still can't be day-bucketed, so velocity skips it — same as before).
    expect(await asA.query(api.analytics.getVelocityStats, {})).toEqual([
      { date: "2026-01-10", storyPoints: 5, issueCount: 1 },
      { date: "2026-02-10", storyPoints: 8, issueCount: 1 },
    ]);
  });

  it("an unknown user short-circuits to defined empty results on every metric", async () => {
    const t = convexTest(schema, modules);
    const ghost = t.withIdentity({ subject: "auth-ghost" }); // no users row

    expect(await ghost.query(api.analytics.getVelocityStats, {})).toEqual([]);
    expect(await ghost.query(api.analytics.getAgreementTrend, {})).toEqual([]);
    expect(await ghost.query(api.analytics.getVoteDistribution, {})).toEqual([]);
    expect(await ghost.query(api.analytics.getSessions, {})).toEqual([]);
    expect(await ghost.query(api.analytics.getParticipationStats, {})).toEqual({
      totalSessions: 0,
      totalIssuesVoted: 0,
      totalVotesCast: 0,
      averageVotesPerSession: 0,
    });
    expect(await ghost.query(api.analytics.getTimeToConsensus, {})).toEqual({
      averageMs: null,
      medianMs: null,
      outliers: [],
      trendBySession: [],
    });
    expect(await ghost.query(api.analytics.getVoterAlignment, {})).toEqual({
      users: [],
      scatterPoints: [],
    });
    expect(await ghost.query(api.analytics.getPredictability, {})).toEqual({
      predictabilityScore: null,
      sessions: [],
      averageVelocityPerSession: 0,
      velocityTrend: "stable",
      averageAgreement: 0,
      agreementTrend: "stable",
    });
    expect(await ghost.query(api.analytics.getSummary, {})).toEqual({
      totalSessions: 0,
      totalIssuesEstimated: 0,
      totalStoryPoints: null,
      averageAgreement: null,
    });
  });
});

describe("getVoteDistribution honors the date range (bug fix)", () => {
  it("a range now excludes out-of-range AND votedAt-less issues", async () => {
    const t = convexTest(schema, modules);
    await seedMixedHistory(t);
    const asA = t.withIdentity({ subject: "auth-a" });

    // Old behavior: the votedAt-less "13" leaked into ranged results, and the
    // out-of-range "8" was filtered — the copies disagreed. Now uniform:
    // a range windows on issue.votedAt, so only "5" remains.
    expect(
      await asA.query(api.analytics.getVoteDistribution, { dateRange: RANGE })
    ).toEqual([{ value: "5", count: 1, percentage: 100 }]);
  });

  it("without a range every completed issue is counted (unchanged)", async () => {
    const t = convexTest(schema, modules);
    await seedMixedHistory(t);
    const asA = t.withIdentity({ subject: "auth-a" });

    expect(await asA.query(api.analytics.getVoteDistribution, {})).toEqual([
      { value: "5", count: 1, percentage: 33 },
      { value: "8", count: 1, percentage: 33 },
      { value: "13", count: 1, percentage: 33 },
    ]);
  });
});

describe("getParticipationStats counts real votes from individualVotes (bug fix)", () => {
  async function seedParticipation(t: T) {
    const userId = await seedUser(t, "auth-a");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, userId, IN);
    const i1 = await seedIssue(t, roomId, { sequentialId: 1, votedAt: IN, finalEstimate: "5" });
    const i2 = await seedIssue(t, roomId, { sequentialId: 2, votedAt: IN, finalEstimate: "8" });
    // Five real vote snapshots in range across the two issues, one outside.
    for (const [n, issueId] of [1, 2, 3].map((n) => [n, i1] as const)) {
      await seedVote(t, { roomId, issueId, userId, cardLabel: String(n + 2), votedAt: IN });
    }
    await seedVote(t, { roomId, issueId: i2, userId, cardLabel: "5", votedAt: IN });
    await seedVote(t, { roomId, issueId: i2, userId, cardLabel: "8", votedAt: IN });
    await seedVote(t, { roomId, issueId: i2, userId, cardLabel: "8", votedAt: OUT });
  }

  it("totalVotesCast is the real snapshot count, not the completed-issue count", async () => {
    const t = convexTest(schema, modules);
    await seedParticipation(t);
    const asA = t.withIdentity({ subject: "auth-a" });

    // Old behavior: totalVotesCast === totalIssuesVoted (2) — knowingly fake.
    expect(await asA.query(api.analytics.getParticipationStats, { dateRange: RANGE })).toEqual({
      totalSessions: 1,
      totalIssuesVoted: 2,
      totalVotesCast: 5,
      averageVotesPerSession: 5,
    });

    // Without a range the out-of-range snapshot counts too.
    expect(await asA.query(api.analytics.getParticipationStats, {})).toEqual({
      totalSessions: 1,
      totalIssuesVoted: 2,
      totalVotesCast: 6,
      averageVotesPerSession: 6,
    });
  });

  it("totalSessions windows on membership.joinedAt while activity windows on votedAt", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, userId, OUT); // joined outside the window
    await seedIssue(t, roomId, { sequentialId: 1, votedAt: IN, finalEstimate: "5" });
    const asA = t.withIdentity({ subject: "auth-a" });

    // Documented split: the session count is membership-tenure (joinedAt),
    // issue/vote activity is votedAt-windowed across all of the user's rooms.
    expect(await asA.query(api.analytics.getParticipationStats, { dateRange: RANGE })).toEqual({
      totalSessions: 0,
      totalIssuesVoted: 1,
      totalVotesCast: 0,
      averageVotesPerSession: 0,
    });
  });
});

describe("getVoterAlignment through the aggregate", () => {
  it("resolves names and windows votes on the vote's own votedAt", async () => {
    const t = convexTest(schema, modules);
    const viewer = await seedUser(t, "auth-a");
    const ada = await seedUser(t, "auth-ada", "Ada");
    const bob = await seedUser(t, "auth-bob", "Bob");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, viewer, IN);
    const i1 = await seedIssue(t, roomId, { sequentialId: 1, votedAt: IN, finalEstimate: "5" });
    await seedVote(t, { roomId, issueId: i1, userId: ada, cardLabel: "5", consensusLabel: "5", deltaSteps: 0, votedAt: IN });
    await seedVote(t, { roomId, issueId: i1, userId: bob, cardLabel: "3", consensusLabel: "5", deltaSteps: -1, votedAt: IN });
    await seedVote(t, { roomId, issueId: i1, userId: ada, cardLabel: "8", consensusLabel: "5", deltaSteps: 1, votedAt: OUT });

    const asA = t.withIdentity({ subject: "auth-a" });
    const ranged = await asA.query(api.analytics.getVoterAlignment, { dateRange: RANGE });
    expect(ranged.users).toEqual([
      { userId: ada, userName: "Ada", totalVotes: 1, agreesWithConsensus: 1, agreementRate: 100, averageDelta: 0, tendency: "aligned" },
      { userId: bob, userName: "Bob", totalVotes: 1, agreesWithConsensus: 0, agreementRate: 0, averageDelta: -1, tendency: "under" },
    ]);

    // Without a range Ada's out-of-range vote joins her stats.
    const unranged = await asA.query(api.analytics.getVoterAlignment, {});
    expect(unranged.users.find((u) => u.userId === ada)).toMatchObject({
      totalVotes: 2,
      averageDelta: 0.5,
    });
  });
});

describe("getUserSessions keeps membership-tenure semantics", () => {
  it("a range filters on joinedAt while per-session stats stay room-lifetime", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a");
    const roomA = await seedRoom(t, "A");
    const roomB = await seedRoom(t, "B");
    await addMembership(t, roomA, userId, IN);
    await addMembership(t, roomB, userId, OUT);
    // Room A's issues were voted OUTSIDE the range — a session row reports
    // room-lifetime stats, so they still count for the in-window membership.
    await seedIssue(t, roomA, { sequentialId: 1, votedAt: OUT, finalEstimate: "5", voteStats: { agreement: 80, voteCount: 2 } });
    await seedIssue(t, roomA, { sequentialId: 2, votedAt: OUT, finalEstimate: "3" });
    await seedIssue(t, roomB, { sequentialId: 1, votedAt: OUT, finalEstimate: "8" });
    const asA = t.withIdentity({ subject: "auth-a" });

    const ranged = await asA.query(api.analytics.getSessions, { dateRange: RANGE });
    expect(ranged).toHaveLength(1);
    expect(ranged[0]).toMatchObject({
      roomName: "A",
      joinedAt: IN,
      issuesCompleted: 2,
      totalStoryPoints: 8,
      averageAgreement: 80,
      participantCount: 1,
    });

    const unranged = await asA.query(api.analytics.getSessions, {});
    expect(unranged.map((s) => s.roomName).sort()).toEqual(["A", "B"]);
  });
});
