import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import * as AnalyticsMath from "../analyticsMath";

// The response shapes are owned by the pure projection module; re-exported
// here so existing imports from this module keep working.
export type {
  AgreementDataPoint,
  VelocityDataPoint,
  VoteDistributionItem,
  ParticipationStats,
  TimeToConsensusStats,
  VoterAlignmentUser,
  VoterAlignmentScatterPoint,
  VoterAlignmentData,
  PredictabilitySession,
  PredictabilityData,
  DashboardSummary,
} from "../analyticsMath";

export interface SessionSummary {
  roomId: string;
  roomName: string;
  joinedAt: number;
  lastActivityAt: number;
  issuesCompleted: number;
  totalStoryPoints: number | null; // null if non-numeric scale
  averageAgreement: number | null;
  participantCount: number;
}

export interface DateRange {
  from: number; // timestamp
  to: number; // timestamp
}

/**
 * The trimmed completed-issue record the projections need — the shape stored
 * in a room's analytics snapshot. Structurally satisfies AnalyticsMath.HistoryIssue.
 */
export interface HistoryIssueRecord {
  title: string;
  votedAt?: number;
  finalEstimate?: string;
  voteStats?: {
    agreement: number;
    timeToConsensusMs?: number;
  };
}

/** The trimmed per-voter record stored in a room's analytics snapshot. */
export interface HistoryVoteRecord {
  userId: Id<"users">;
  cardLabel: string;
  consensusLabel?: string;
  deltaSteps?: number;
  votedAt: number;
}

/**
 * One room's slice of the user's completed-issue history: the room's
 * completed issues plus the joins analytics metrics need. Sourced from the
 * room's analytics snapshot when one is fresh, else scanned live — either way
 * the records are the same trimmed shape, so projections are pure over it.
 */
export interface RoomHistory {
  membership: Doc<"roomMemberships">;
  room: Doc<"rooms">;
  completedIssues: HistoryIssueRecord[];
  individualVotes: HistoryVoteRecord[];
}

/**
 * Gets all room memberships for a user with room details
 */
export async function getUserMemberships(
  ctx: QueryCtx,
  authUserId: string
): Promise<Array<{ membership: Doc<"roomMemberships">; room: Doc<"rooms"> }>> {
  // Find global user
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
    .first();

  if (!user) return [];

  // Get all memberships
  const memberships = await ctx.db
    .query("roomMemberships")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();

  // Fetch room details for each membership
  const results = await Promise.all(
    memberships.map(async (membership) => {
      const room = await ctx.db.get(membership.roomId);
      if (!room) return null;
      return { membership, room };
    })
  );

  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * completedIssueHistory — THE one memberships → rooms → history aggregate
 * behind every analytics metric. Model functions are scan → project: they call
 * this aggregate and hand the rows to a pure projection in analyticsMath.
 *
 * Source: each room's history comes from its `roomAnalyticsSnapshots` row when
 * one exists and is fresh — written when a round completes its target issue
 * (refreshRoomAnalyticsSnapshot) — else from a live scan of the room's tables
 * (legacy rooms before their next completion, and rooms with any activity
 * since the snapshot was computed; see roomHistories for the freshness rule).
 * Both sources produce identical records.
 *
 * Date semantics: a date range windows on `issue.votedAt` — when voting
 * completed — never on `membership.joinedAt`. An issue without a `votedAt`
 * can't be placed in a window, so a range excludes it; with no range every
 * completed issue is history. Membership-tenure filtering survives only in
 * getUserSessions and getParticipationStats.totalSessions, where the metric
 * is about the membership itself (see those functions).
 *
 * individualVotes are windowed at consumption, not here: vote-level metrics
 * window on the vote's own `votedAt` (see votesInRange).
 */
export async function completedIssueHistory(
  ctx: QueryCtx,
  authUserId: string,
  dateRange?: DateRange
): Promise<RoomHistory[]> {
  const history = await roomHistories(ctx, authUserId);
  if (!dateRange) return history;
  return history.map((h) => ({
    ...h,
    completedIssues: h.completedIssues.filter(
      (i) =>
        i.votedAt !== undefined &&
        i.votedAt >= dateRange.from &&
        i.votedAt <= dateRange.to
    ),
  }));
}

/** Trims a completed issue Doc to the record the snapshot stores. */
function toIssueRecord(issue: Doc<"issues">): HistoryIssueRecord {
  return {
    title: issue.title,
    ...(issue.votedAt !== undefined ? { votedAt: issue.votedAt } : {}),
    ...(issue.finalEstimate !== undefined
      ? { finalEstimate: issue.finalEstimate }
      : {}),
    ...(issue.voteStats !== undefined
      ? {
          voteStats: {
            agreement: issue.voteStats.agreement,
            ...(issue.voteStats.timeToConsensusMs !== undefined
              ? { timeToConsensusMs: issue.voteStats.timeToConsensusMs }
              : {}),
          },
        }
      : {}),
  };
}

/** Trims an individualVotes Doc to the record the snapshot stores. */
function toVoteRecord(vote: Doc<"individualVotes">): HistoryVoteRecord {
  return {
    userId: vote.userId,
    cardLabel: vote.cardLabel,
    ...(vote.consensusLabel !== undefined
      ? { consensusLabel: vote.consensusLabel }
      : {}),
    ...(vote.deltaSteps !== undefined ? { deltaSteps: vote.deltaSteps } : {}),
    votedAt: vote.votedAt,
  };
}

/**
 * The live scan behind the snapshot: one room's completed issues and vote
 * snapshots, straight from the tables. Used when no fresh snapshot exists, and
 * by the snapshot write path itself.
 */
async function scanRoomHistory(
  ctx: QueryCtx,
  membership: Doc<"roomMemberships">,
  room: Doc<"rooms">
): Promise<RoomHistory> {
  const [issues, individualVotes] = await Promise.all([
    ctx.db
      .query("issues")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect(),
    ctx.db
      .query("individualVotes")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect(),
  ]);

  return {
    membership,
    room,
    completedIssues: issues
      .filter((i) => i.status === "completed")
      .map(toIssueRecord),
    individualVotes: individualVotes.map(toVoteRecord),
  };
}

/**
 * Loads every room's history for a user: one snapshot read per room when
 * fresh, the live scan otherwise.
 *
 * Freshness rule: every mutation that touches a room's history bumps
 * `room.lastActivityAt` (issue edits/removals, round transitions, votes), so a
 * snapshot computed at or after the room's last activity covers every write
 * the history could have seen. A snapshot older than the room's last activity
 * is treated as absent — the scan returns identical rows, just slower. This
 * errs toward stale-never-served over hit-rate: active rooms re-scan until
 * play settles, while the dashboard's typical post-session read hits the
 * snapshot.
 */
async function roomHistories(
  ctx: QueryCtx,
  authUserId: string
): Promise<RoomHistory[]> {
  const membershipsWithRooms = await getUserMemberships(ctx, authUserId);

  return Promise.all(
    membershipsWithRooms.map(async ({ membership, room }) => {
      const snapshot = await ctx.db
        .query("roomAnalyticsSnapshots")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .first();

      if (snapshot && snapshot.computedAt >= room.lastActivityAt) {
        return {
          membership,
          room,
          completedIssues: snapshot.history.completedIssues,
          individualVotes: snapshot.history.individualVotes,
        };
      }

      return scanRoomHistory(ctx, membership, room);
    })
  );
}

/**
 * refreshRoomAnalyticsSnapshot — the write side of the snapshot. Recomputes
 * the room's completed-issue history and upserts the room's one snapshot row.
 * Called when a round completes its target issue (votingRound.reveal), after
 * the issue and vote snapshots for that round have landed, so the history is
 * whole. Rooms complete rounds at human timescale, so the inline recompute is
 * fine.
 */
export async function refreshRoomAnalyticsSnapshot(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<void> {
  const [issues, individualVotes] = await Promise.all([
    ctx.db
      .query("issues")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
    ctx.db
      .query("individualVotes")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect(),
  ]);

  const history = {
    completedIssues: issues
      .filter((i) => i.status === "completed")
      .map(toIssueRecord),
    individualVotes: individualVotes.map(toVoteRecord),
  };
  const computedAt = Date.now();

  const existing = await ctx.db
    .query("roomAnalyticsSnapshots")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { history, computedAt });
  } else {
    await ctx.db.insert("roomAnalyticsSnapshots", {
      roomId,
      history,
      computedAt,
    });
  }
}

/** Flattens the aggregate into issue entries carrying their room context. */
function flattenIssues(history: RoomHistory[]): AnalyticsMath.RoomIssue[] {
  return history.flatMap(({ room, completedIssues }) =>
    completedIssues.map((issue) => ({
      roomId: room._id,
      roomName: room.name,
      issue,
    }))
  );
}

/** Filters vote rows to a date range on the vote's own votedAt. */
function votesInRange(
  history: RoomHistory[],
  dateRange?: DateRange
): HistoryVoteRecord[] {
  return history
    .flatMap((h) => h.individualVotes)
    .filter(
      (v) =>
        !dateRange || (v.votedAt >= dateRange.from && v.votedAt <= dateRange.to)
    );
}

/**
 * Gets session history summaries for a user
 */
export async function getUserSessions(
  ctx: QueryCtx,
  authUserId: string,
  dateRange?: DateRange
): Promise<SessionSummary[]> {
  // No range on the aggregate: a session row reports the room's lifetime
  // issue stats. The range instead windows on membership.joinedAt — session
  // history is a membership-tenure view ("rooms I joined in this window"),
  // and joinedAt is a displayed field of each row.
  const history = await completedIssueHistory(ctx, authUserId);

  const filtered = dateRange
    ? history.filter(
        ({ membership }) =>
          membership.joinedAt >= dateRange.from &&
          membership.joinedAt <= dateRange.to
      )
    : history;

  const summaries = await Promise.all(
    filtered.map(async ({ membership, room, completedIssues }) => {
      const roomMembers = await ctx.db
        .query("roomMemberships")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();

      return {
        roomId: room._id,
        roomName: room.name,
        joinedAt: membership.joinedAt,
        lastActivityAt: room.lastActivityAt,
        ...AnalyticsMath.sessionIssueStats(completedIssues),
        participantCount: roomMembers.length,
      };
    })
  );

  // Sort by most recent activity
  return summaries.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

/**
 * Gets agreement trend data points across all user's sessions
 */
export async function getAgreementTrend(
  ctx: QueryCtx,
  authUserId: string,
  dateRange?: DateRange
): Promise<AnalyticsMath.AgreementDataPoint[]> {
  const history = await completedIssueHistory(ctx, authUserId, dateRange);
  return AnalyticsMath.agreementTrend(flattenIssues(history));
}

/**
 * Gets velocity data (story points per day)
 */
export async function getVelocityStats(
  ctx: QueryCtx,
  authUserId: string,
  dateRange?: DateRange
): Promise<AnalyticsMath.VelocityDataPoint[]> {
  const history = await completedIssueHistory(ctx, authUserId, dateRange);
  return AnalyticsMath.velocityByDay(flattenIssues(history));
}

/**
 * Gets distribution of final estimates (vote values)
 */
export async function getVoteDistribution(
  ctx: QueryCtx,
  authUserId: string,
  dateRange?: DateRange
): Promise<AnalyticsMath.VoteDistributionItem[]> {
  const history = await completedIssueHistory(ctx, authUserId, dateRange);
  return AnalyticsMath.voteDistribution(
    history.flatMap((h) => h.completedIssues)
  );
}

/**
 * Gets overall participation statistics
 */
export async function getParticipationStats(
  ctx: QueryCtx,
  authUserId: string,
  dateRange?: DateRange
): Promise<AnalyticsMath.ParticipationStats> {
  const history = await completedIssueHistory(ctx, authUserId, dateRange);

  // totalSessions is membership-tenure: sessions joined within the window.
  const totalSessions = dateRange
    ? history.filter(
        ({ membership }) =>
          membership.joinedAt >= dateRange.from &&
          membership.joinedAt <= dateRange.to
      ).length
    : history.length;

  // Issue/vote activity windows on votedAt via the aggregate, across all of
  // the user's rooms. totalVotesCast counts real individualVotes snapshots
  // (the old code faked it with the completed-issue count).
  const totalIssuesVoted = history.reduce(
    (sum, h) => sum + h.completedIssues.length,
    0
  );
  const totalVotesCast = votesInRange(history, dateRange).length;

  return AnalyticsMath.participationStats({
    totalSessions,
    totalIssuesVoted,
    totalVotesCast,
  });
}

/**
 * Gets time-to-consensus statistics across all user's sessions
 */
export async function getTimeToConsensusStats(
  ctx: QueryCtx,
  authUserId: string,
  dateRange?: DateRange
): Promise<AnalyticsMath.TimeToConsensusStats> {
  const history = await completedIssueHistory(ctx, authUserId, dateRange);
  return AnalyticsMath.timeToConsensus(flattenIssues(history));
}

/**
 * Gets summary statistics for the dashboard header
 */
export async function getDashboardSummary(
  ctx: QueryCtx,
  authUserId: string,
  dateRange?: DateRange
): Promise<AnalyticsMath.DashboardSummary> {
  const sessions = await getUserSessions(ctx, authUserId, dateRange);
  return AnalyticsMath.dashboardSummary(sessions);
}

/**
 * Gets voter alignment statistics across all user's sessions
 */
export async function getVoterAlignment(
  ctx: QueryCtx,
  authUserId: string,
  dateRange?: DateRange
): Promise<AnalyticsMath.VoterAlignmentData> {
  const history = await completedIssueHistory(ctx, authUserId, dateRange);
  const votes = votesInRange(history, dateRange);

  // Batch-resolve user names
  const userIds = [...new Set(votes.map((v) => v.userId))];
  const resolvedUsers = await Promise.all(userIds.map((id) => ctx.db.get(id)));
  const userNames: Record<string, string> = {};
  userIds.forEach((id, i) => {
    userNames[id] = resolvedUsers[i]?.name ?? "Unknown";
  });

  return AnalyticsMath.voterAlignment(votes, userNames);
}

/**
 * Computes sprint predictability score and related metrics.
 * The score formula lives in analyticsMath.predictability.
 */
export async function getPredictabilityScore(
  ctx: QueryCtx,
  authUserId: string,
  dateRange?: DateRange
): Promise<AnalyticsMath.PredictabilityData> {
  const history = await completedIssueHistory(ctx, authUserId, dateRange);
  return AnalyticsMath.predictability(
    history.map(({ room, completedIssues }) => ({
      roomId: room._id,
      roomName: room.name,
      issues: completedIssues,
    }))
  );
}
