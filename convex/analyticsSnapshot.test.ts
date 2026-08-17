/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import * as Analytics from "./model/analytics";
import * as Issues from "./model/issues";
import * as VotingRound from "./model/votingRound";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

// Deterministic UTC timestamps: IN lands inside RANGE, OUT outside it.
const BASE = Date.UTC(2026, 0, 5, 12); // 2026-01-05
const IN = Date.UTC(2026, 0, 10, 12); // 2026-01-10
const OUT = Date.UTC(2026, 1, 10, 12); // 2026-02-10
const RANGE = { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 0, 31, 23, 59, 59) };

afterEach(() => {
  vi.useRealTimers();
});

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

/** Plays one full round on an issue: start -> one vote -> reveal (consensus). */
async function playRound(
  t: T,
  roomId: Id<"rooms">,
  issueId: Id<"issues">,
  userId: Id<"users">,
  cardLabel = "5"
): Promise<void> {
  await t.run((ctx) => VotingRound.start(ctx, { roomId, issueId }));
  await t.run((ctx) =>
    VotingRound.castVote(ctx, { roomId, userId, cardLabel, cardValue: 0 })
  );
  await t.run((ctx) => VotingRound.reveal(ctx, roomId));
}

async function readSnapshot(
  t: T,
  roomId: Id<"rooms">
): Promise<Doc<"roomAnalyticsSnapshots"> | null> {
  return t.run((ctx) =>
    ctx.db
      .query("roomAnalyticsSnapshots")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .first()
  );
}

async function countSnapshots(t: T, roomId: Id<"rooms">): Promise<number> {
  const rows = await t.run((ctx) =>
    ctx.db
      .query("roomAnalyticsSnapshots")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  );
  return rows.length;
}

async function refreshSnapshot(t: T, roomId: Id<"rooms">): Promise<void> {
  await t.run((ctx) => Analytics.refreshRoomAnalyticsSnapshot(ctx, roomId));
}

describe("snapshot write path — round completion", () => {
  it("reveal with consensus upserts the room's snapshot with the completed history", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, userId, IN);
    const issueId = await seedIssue(t, roomId, { sequentialId: 1, status: "pending" });

    expect(await readSnapshot(t, roomId)).toBeNull();

    await playRound(t, roomId, issueId, userId, "5");

    const snapshot = await readSnapshot(t, roomId);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.history.completedIssues).toEqual([
      {
        title: "Issue 1",
        votedAt: expect.any(Number),
        finalEstimate: "5",
        voteStats: { agreement: 100, timeToConsensusMs: expect.any(Number) },
      },
    ]);
    expect(snapshot!.history.individualVotes).toEqual([
      {
        userId,
        cardLabel: "5",
        consensusLabel: "5",
        votedAt: expect.any(Number),
      },
    ]);

    // The snapshot is fresh against the room's own activity clock, so the
    // read path serves it (see the freshness rule in model/analytics.ts).
    const room = await t.run((ctx) => ctx.db.get(roomId));
    expect(snapshot!.computedAt).toBeGreaterThanOrEqual(room!.lastActivityAt);
  });

  it("a second completed round refreshes the one snapshot row in place", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, userId, IN);
    const i1 = await seedIssue(t, roomId, { sequentialId: 1, status: "pending" });
    const i2 = await seedIssue(t, roomId, { sequentialId: 2, status: "pending" });

    await playRound(t, roomId, i1, userId, "5");
    const first = await readSnapshot(t, roomId);

    await playRound(t, roomId, i2, userId, "8");

    expect(await countSnapshots(t, roomId)).toBe(1);
    const second = await readSnapshot(t, roomId);
    expect(second!._id).toBe(first!._id); // upsert, not a new row
    expect(second!.computedAt).toBeGreaterThanOrEqual(first!.computedAt);
    expect(second!.history.completedIssues).toHaveLength(2);
    expect(second!.history.individualVotes).toHaveLength(2);
  });

  it("a consensus-less reveal (all special cards) writes no snapshot", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, userId, IN);
    const issueId = await seedIssue(t, roomId, { sequentialId: 1, status: "pending" });

    await playRound(t, roomId, issueId, userId, "?");

    expect(await readSnapshot(t, roomId)).toBeNull();
  });
});

describe("snapshot read path — fallback vs snapshot equivalence", () => {
  async function seedRichHistory(t: T) {
    const viewer = await seedUser(t, "auth-a");
    const ada = await seedUser(t, "auth-ada", "Ada");
    const roomId = await seedRoom(t, "Team Room");
    await addMembership(t, roomId, viewer, IN);
    await addMembership(t, roomId, ada, IN);
    const i1 = await seedIssue(t, roomId, {
      sequentialId: 1,
      votedAt: IN,
      finalEstimate: "5",
      voteStats: { agreement: 50, voteCount: 2, timeToConsensusMs: 60_000 },
    });
    const i2 = await seedIssue(t, roomId, {
      sequentialId: 2,
      votedAt: IN + 86_400_000,
      finalEstimate: "8",
      voteStats: { agreement: 100, voteCount: 2, timeToConsensusMs: 30_000 },
    });
    await seedIssue(t, roomId, { sequentialId: 3, votedAt: OUT, finalEstimate: "13" });
    await seedIssue(t, roomId, { sequentialId: 4, finalEstimate: "21" }); // no votedAt
    await seedIssue(t, roomId, { sequentialId: 5, status: "voting" }); // not completed
    await seedVote(t, { roomId, issueId: i1, userId: viewer, cardLabel: "5", consensusLabel: "5", deltaSteps: 0, votedAt: IN });
    await seedVote(t, { roomId, issueId: i1, userId: ada, cardLabel: "3", consensusLabel: "5", deltaSteps: -1, votedAt: IN });
    await seedVote(t, { roomId, issueId: i2, userId: viewer, cardLabel: "8", consensusLabel: "8", deltaSteps: 0, votedAt: IN + 86_400_000 });
    await seedVote(t, { roomId, issueId: i2, userId: ada, cardLabel: "8", consensusLabel: "8", deltaSteps: 0, votedAt: OUT });
    return { viewer, roomId };
  }

  /** Runs all 9 registered analytics queries as auth-a, ranged and unranged. */
  async function runAllQueries(t: T) {
    const asA = t.withIdentity({ subject: "auth-a" });
    return {
      summary: await asA.query(api.analytics.getSummary, {}),
      summaryRanged: await asA.query(api.analytics.getSummary, { dateRange: RANGE }),
      sessions: await asA.query(api.analytics.getSessions, {}),
      sessionsRanged: await asA.query(api.analytics.getSessions, { dateRange: RANGE }),
      agreementTrend: await asA.query(api.analytics.getAgreementTrend, {}),
      agreementTrendRanged: await asA.query(api.analytics.getAgreementTrend, { dateRange: RANGE }),
      velocity: await asA.query(api.analytics.getVelocityStats, {}),
      velocityRanged: await asA.query(api.analytics.getVelocityStats, { dateRange: RANGE }),
      distribution: await asA.query(api.analytics.getVoteDistribution, {}),
      distributionRanged: await asA.query(api.analytics.getVoteDistribution, { dateRange: RANGE }),
      timeToConsensus: await asA.query(api.analytics.getTimeToConsensus, {}),
      timeToConsensusRanged: await asA.query(api.analytics.getTimeToConsensus, { dateRange: RANGE }),
      participation: await asA.query(api.analytics.getParticipationStats, {}),
      participationRanged: await asA.query(api.analytics.getParticipationStats, { dateRange: RANGE }),
      predictability: await asA.query(api.analytics.getPredictability, {}),
      predictabilityRanged: await asA.query(api.analytics.getPredictability, { dateRange: RANGE }),
      alignment: await asA.query(api.analytics.getVoterAlignment, {}),
      alignmentRanged: await asA.query(api.analytics.getVoterAlignment, { dateRange: RANGE }),
    };
  }

  it("all 9 queries return identical results from the fallback scan and the snapshot", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRichHistory(t);

    const fallback = await runAllQueries(t);
    expect(await readSnapshot(t, roomId)).toBeNull(); // fallback path

    await refreshSnapshot(t, roomId);
    const fromSnapshot = await runAllQueries(t);

    expect(fromSnapshot).toEqual(fallback);
  });

  it("a fresh snapshot is the source of truth even if the tables drift", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await seedRichHistory(t);
    await refreshSnapshot(t, roomId);

    // Raw-delete the issues without going through the model (no activity
    // bump): the snapshot is still fresh, so the query serves its rows.
    await t.run(async (ctx) => {
      const issues = await ctx.db
        .query("issues")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect();
      await Promise.all(issues.map((i) => ctx.db.delete(i._id)));
    });

    const asA = t.withIdentity({ subject: "auth-a" });
    const distribution = await asA.query(api.analytics.getVoteDistribution, {});
    expect(distribution.length).toBeGreaterThan(0);
  });
});

describe("stale snapshot — history-changing writes outside completion", () => {
  it("removing a completed issue invalidates the snapshot (fallback serves the scan)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);

    vi.setSystemTime(BASE);
    const viewer = await seedUser(t, "auth-a");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, viewer, IN);
    const issueId = await seedIssue(t, roomId, {
      sequentialId: 1,
      votedAt: IN,
      finalEstimate: "5",
    });

    vi.setSystemTime(BASE + 1_000);
    await refreshSnapshot(t, roomId);
    const asA = t.withIdentity({ subject: "auth-a" });
    expect(await asA.query(api.analytics.getVoteDistribution, {})).toEqual([
      { value: "5", count: 1, percentage: 100 },
    ]);

    // removeIssue bumps the room's activity clock past the snapshot.
    vi.setSystemTime(BASE + 2_000);
    await t.run((ctx) => Issues.removeIssue(ctx, issueId));

    expect(await asA.query(api.analytics.getVoteDistribution, {})).toEqual([]);
  });

  it("editing a completed issue's estimate invalidates the snapshot", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);

    vi.setSystemTime(BASE);
    const viewer = await seedUser(t, "auth-a");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, viewer, IN);
    const issueId = await seedIssue(t, roomId, {
      sequentialId: 1,
      votedAt: IN,
      finalEstimate: "5",
    });

    vi.setSystemTime(BASE + 1_000);
    await refreshSnapshot(t, roomId);

    vi.setSystemTime(BASE + 2_000);
    await t.run((ctx) =>
      Issues.updateIssueEstimate(ctx, { issueId, finalEstimate: "8" })
    );

    const asA = t.withIdentity({ subject: "auth-a" });
    expect(await asA.query(api.analytics.getVoteDistribution, {})).toEqual([
      { value: "8", count: 1, percentage: 100 },
    ]);
  });

  it("the next completion after a stale period rewrites a correct snapshot", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);

    vi.setSystemTime(BASE);
    const userId = await seedUser(t, "auth-a");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, userId, IN);
    const i1 = await seedIssue(t, roomId, { sequentialId: 1, status: "pending" });

    await playRound(t, roomId, i1, userId, "5");
    expect((await readSnapshot(t, roomId))!.history.completedIssues).toHaveLength(1);

    // History changes without a completion (estimate override).
    vi.setSystemTime(BASE + 2_000);
    await t.run((ctx) =>
      Issues.updateIssueEstimate(ctx, { issueId: i1, finalEstimate: "13" })
    );

    // The next completion recomputes from the tables, picking the override up.
    vi.setSystemTime(BASE + 3_000);
    const i2 = await seedIssue(t, roomId, { sequentialId: 2, status: "pending" });
    await playRound(t, roomId, i2, userId, "8");

    const asA = t.withIdentity({ subject: "auth-a" });
    // Tied counts enumerate in JS numeric-key order, not insertion order.
    expect(await asA.query(api.analytics.getVoteDistribution, {})).toEqual([
      { value: "8", count: 1, percentage: 50 },
      { value: "13", count: 1, percentage: 50 },
    ]);
  });
});

describe("export path — issue links fetched by room", () => {
  it("resolves links written with and without roomId identically", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a");
    const roomId = await seedRoom(t);
    await addMembership(t, roomId, userId, IN);
    const i1 = await seedIssue(t, roomId, { sequentialId: 1, votedAt: IN, finalEstimate: "5" });
    const i2 = await seedIssue(t, roomId, { sequentialId: 2, votedAt: IN, finalEstimate: "8" });
    await seedIssue(t, roomId, { sequentialId: 3, status: "pending" });

    // A link carrying the denormalized roomId (found via by_room)...
    await t.run((ctx) =>
      ctx.db.insert("issueLinks", {
        issueId: i1,
        roomId,
        provider: "jira",
        externalId: "PROJ-1",
        externalUrl: "https://example.atlassian.net/browse/PROJ-1",
        lastSyncedAt: Date.now(),
      })
    );
    // ...and a legacy link without roomId (found via the by_issue fallback).
    await t.run((ctx) =>
      ctx.db.insert("issueLinks", {
        issueId: i2,
        provider: "github",
        externalId: "42",
        externalUrl: "https://github.com/acme/repo/issues/42",
        lastSyncedAt: Date.now(),
      })
    );

    const asA = t.withIdentity({ subject: "auth-a" });
    const exported = await asA.query(api.issues.getForEnhancedExport, { roomId });

    const byIssue = new Map(exported.map((e) => [e.title, e]));
    expect(byIssue.get("Issue 1")).toMatchObject({
      externalId: "PROJ-1",
      externalUrl: "https://example.atlassian.net/browse/PROJ-1",
    });
    expect(byIssue.get("Issue 2")).toMatchObject({
      externalId: "42",
      externalUrl: "https://github.com/acme/repo/issues/42",
    });
    expect(byIssue.get("Issue 3")).toMatchObject({
      externalId: null,
      externalUrl: null,
    });
  });
});
