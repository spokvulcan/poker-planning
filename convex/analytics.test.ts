/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import {
  type T,
  IN,
  OUT,
  RANGE,
  seedUser,
  seedRoom,
  addMembership,
  seedIssue,
  seedVote,
} from "./analytics.seeds";

const modules = import.meta.glob("./**/*.*s");

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

describe("the dashboard read — every panel of the Overview from one read", () => {
  it("a viewer with no users row gets every panel's empty state", async () => {
    const t = convexTest(schema, modules);
    const ghost = t.withIdentity({ subject: "auth-ghost" }); // no users row

    expect(await ghost.query(api.analytics.getDashboard, {})).toEqual({
      summary: {
        totalSessions: 0,
        totalIssuesEstimated: 0,
        totalStoryPoints: null,
        averageAgreement: null,
      },
      sessions: [],
      agreementChart: { points: [], trend: { direction: "stable", changePct: null } },
      voteDistribution: [],
      timeToConsensus: {
        averageMs: null,
        medianMs: null,
        outliers: [],
        trendBySession: [],
        trend: { direction: "stable", changePct: null },
      },
      voterAlignment: { users: [], scatterPoints: [] },
      predictability: {
        predictabilityScore: null,
        sessions: [],
        averageVelocityPerSession: 0,
        velocityTrend: { direction: "stable", changePct: null },
        averageAgreement: 0,
        agreementTrend: { direction: "stable", changePct: null },
      },
    });
    expect(await ghost.query(api.analytics.getSessions, {})).toEqual([]);
  });

  it("the panels window on issue.votedAt: in-range kept, out-of-range and votedAt-less dropped", async () => {
    const t = convexTest(schema, modules);
    await seedMixedHistory(t);
    const asA = t.withIdentity({ subject: "auth-a" });

    const ranged = await asA.query(api.analytics.getDashboard, { dateRange: RANGE });
    expect(ranged.agreementChart.points.map((p) => p.issueTitle)).toEqual(["Issue 1"]);
    expect(ranged.predictability.sessions).toEqual([
      {
        roomName: "R",
        date: "2026-01-10",
        estimatedPoints: 5,
        issueCount: 1,
        averageAgreement: 80,
        averageTimeToConsensus: 0,
      },
    ]);

    // Without a range every completed issue is history (the votedAt-less one
    // still can't be placed on the timeline, so predictability skips it).
    const unranged = await asA.query(api.analytics.getDashboard, {});
    expect(unranged.predictability.sessions).toEqual([
      {
        roomName: "R",
        date: "2026-02-10",
        estimatedPoints: 13,
        issueCount: 2,
        averageAgreement: 80,
        averageTimeToConsensus: 0,
      },
    ]);
  });

  it("the header and session list window on membership.joinedAt while the panels window on votedAt", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, userId, OUT); // joined outside the window
    await seedIssue(t, roomId, { sequentialId: 1, votedAt: IN, finalEstimate: "5" });
    const asA = t.withIdentity({ subject: "auth-a" });

    // Documented split: the header and session list are membership-tenure
    // (joinedAt), the panels are votedAt-windowed across all of the user's rooms.
    const ranged = await asA.query(api.analytics.getDashboard, { dateRange: RANGE });
    expect(ranged.summary).toEqual({
      totalSessions: 0,
      totalIssuesEstimated: 0,
      totalStoryPoints: null,
      averageAgreement: null,
    });
    expect(ranged.sessions).toEqual([]);
    expect(ranged.voteDistribution).toEqual([{ value: "5", count: 1, percentage: 100 }]);
  });
});

describe("the vote distribution honors the date range (bug fix)", () => {
  it("a range now excludes out-of-range AND votedAt-less issues", async () => {
    const t = convexTest(schema, modules);
    await seedMixedHistory(t);
    const asA = t.withIdentity({ subject: "auth-a" });

    // Old behavior: the votedAt-less "13" leaked into ranged results, and the
    // out-of-range "8" was filtered — the copies disagreed. Now uniform:
    // a range windows on issue.votedAt, so only "5" remains.
    const ranged = await asA.query(api.analytics.getDashboard, { dateRange: RANGE });
    expect(ranged.voteDistribution).toEqual([{ value: "5", count: 1, percentage: 100 }]);
  });

  it("without a range every completed issue is counted (unchanged)", async () => {
    const t = convexTest(schema, modules);
    await seedMixedHistory(t);
    const asA = t.withIdentity({ subject: "auth-a" });

    expect((await asA.query(api.analytics.getDashboard, {})).voteDistribution).toEqual([
      { value: "5", count: 1, percentage: 33 },
      { value: "8", count: 1, percentage: 33 },
      { value: "13", count: 1, percentage: 33 },
    ]);
  });
});

describe("voter alignment through the read", () => {
  it("counts each real vote snapshot, windowed on the vote's own votedAt (bug fix)", async () => {
    const t = convexTest(schema, modules);
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
    const asA = t.withIdentity({ subject: "auth-a" });

    // The old participation counter faked votes with the completed-issue
    // count (2); the votes are the individualVotes snapshots themselves.
    const ranged = await asA.query(api.analytics.getDashboard, { dateRange: RANGE });
    expect(ranged.voterAlignment.users.map((u) => u.totalVotes)).toEqual([5]);

    // Without a range the out-of-range snapshot counts too.
    const unranged = await asA.query(api.analytics.getDashboard, {});
    expect(unranged.voterAlignment.users.map((u) => u.totalVotes)).toEqual([6]);
  });

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
    const ranged = await asA.query(api.analytics.getDashboard, { dateRange: RANGE });
    expect(ranged.voterAlignment.users).toEqual([
      { userId: ada, userName: "Ada", totalVotes: 1, agreesWithConsensus: 1, agreementRate: 100, averageDelta: 0, tendency: "aligned" },
      { userId: bob, userName: "Bob", totalVotes: 1, agreesWithConsensus: 0, agreementRate: 0, averageDelta: -1, tendency: "under" },
    ]);

    // Without a range Ada's out-of-range vote joins her stats.
    const unranged = await asA.query(api.analytics.getDashboard, {});
    expect(unranged.voterAlignment.users.find((u) => u.userId === ada)).toMatchObject({
      totalVotes: 2,
      averageDelta: 0.5,
    });
  });
});

describe("the session list keeps membership-tenure semantics", () => {
  /** Room A joined in RANGE, room B outside it; every issue voted outside it. */
  async function seedTwoRooms(t: T) {
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
  }

  it("a range filters on joinedAt while per-session stats stay room-lifetime", async () => {
    const t = convexTest(schema, modules);
    await seedTwoRooms(t);
    const asA = t.withIdentity({ subject: "auth-a" });

    const ranged = await asA.query(api.analytics.getDashboard, { dateRange: RANGE });
    expect(ranged.sessions).toHaveLength(1);
    expect(ranged.sessions[0]).toMatchObject({
      roomName: "A",
      joinedAt: IN,
      issuesCompleted: 2,
      totalStoryPoints: 8,
      averageAgreement: 80,
      participantCount: 1,
    });
    // The header totals the same rows.
    expect(ranged.summary).toEqual({
      totalSessions: 1,
      totalIssuesEstimated: 2,
      totalStoryPoints: 8,
      averageAgreement: 80,
    });

    const unranged = await asA.query(api.analytics.getDashboard, {});
    expect(unranged.sessions.map((s) => s.roomName).sort()).toEqual(["A", "B"]);
  });

  it("the Sessions page reads the Overview's session list", async () => {
    const t = convexTest(schema, modules);
    await seedTwoRooms(t);
    const asA = t.withIdentity({ subject: "auth-a" });

    for (const args of [{}, { dateRange: RANGE }]) {
      const { sessions } = await asA.query(api.analytics.getDashboard, args);
      expect(await asA.query(api.analytics.getSessions, args)).toEqual(sessions);
    }
  });
});

describe("retros never count towards poker analytics", () => {
  it("a retro the user joined adds no session", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a");
    const pokerId = await seedRoom(t, "Poker");
    const retroId = await seedRoom(t, "Retro");
    await t.run((ctx) => ctx.db.patch("rooms", retroId, { roomType: "retro" }));
    await addMembership(t, pokerId, userId, IN);
    await addMembership(t, retroId, userId, IN);
    await seedIssue(t, pokerId, { sequentialId: 1, votedAt: IN, finalEstimate: "5" });
    const asA = t.withIdentity({ subject: "auth-a" });

    const dashboard = await asA.query(api.analytics.getDashboard, {});
    expect(dashboard.sessions.map((s) => s.roomName)).toEqual(["Poker"]);
    expect(dashboard.summary.totalSessions).toBe(1);
    expect(dashboard.predictability.sessions.map((s) => s.roomName)).toEqual(["Poker"]);
    expect((await asA.query(api.analytics.getSessions, {})).map((s) => s.roomName)).toEqual(["Poker"]);
  });
});
