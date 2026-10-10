import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import * as AnalyticsMath from "../analyticsMath";
import { rulesOf } from "../ceremony";
import type { UserRows } from "./userRows";

// The response shapes are owned by the pure projection module; re-exported
// here so existing imports from this module keep working.
export type {
  AgreementDataPoint,
  VoteDistributionItem,
  TimeToConsensusStats,
  VoterAlignmentUser,
  VoterAlignmentScatterPoint,
  VoterAlignmentData,
  PredictabilitySession,
  PredictabilityData,
  DashboardSummary,
  SessionSummary,
  Dashboard,
} from "../analyticsMath";

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
 * Gets all planning poker room memberships for a user with room details.
 * Retros are a different ceremony and never count towards poker analytics.
 * A viewer with no users row yet (model/caller.ts) has none.
 */
export async function getUserMemberships(
  ctx: QueryCtx,
  user: Doc<"users"> | null
): Promise<Array<{ membership: Doc<"roomMemberships">; room: Doc<"rooms"> }>> {
  if (!user) return [];

  // Get all memberships
  const memberships = await ctx.db
    .query("roomMemberships")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();

  // Fetch room details for each membership
  const results = await Promise.all(
    memberships.map(async (membership) => {
      const room = await ctx.db.get("rooms", membership.roomId);
      if (!room || !rulesOf(room).inAnalytics) return null;
      return { membership, room };
    })
  );

  return results.filter((r): r is NonNullable<typeof r> => r !== null);
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
 * The one room-table scan: completed issues + vote snapshots as records. Used
 * when no fresh snapshot exists, and by the snapshot write path itself.
 */
async function collectRoomHistoryRecords(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Pick<RoomHistory, "completedIssues" | "individualVotes">> {
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

  return {
    completedIssues: issues
      .filter((i) => i.status === "completed")
      .map(toIssueRecord),
    individualVotes: individualVotes.map(toVoteRecord),
  };
}

/**
 * completedIssueHistory — THE one memberships → rooms → history aggregate
 * behind every analytics number, loaded once per read and never windowed
 * here: getDashboard states the date windows. Each of the viewer's poker
 * rooms comes with its membership, its completed issues and the votes cast
 * on them.
 *
 * Source: each room's history comes from its `roomAnalyticsSnapshots` row when
 * one exists and is fresh — written when a round completes its target issue
 * (refreshRoomAnalyticsSnapshot) — else from a live scan of the room's tables
 * (legacy rooms before their next completion, and rooms with any activity
 * since the snapshot was computed). Both sources produce identical records.
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
async function completedIssueHistory(
  ctx: QueryCtx,
  user: Doc<"users"> | null
): Promise<RoomHistory[]> {
  const membershipsWithRooms = await getUserMemberships(ctx, user);

  return Promise.all(
    membershipsWithRooms.map(async ({ membership, room }) => {
      // One snapshot row per room — .unique() enforces the invariant the
      // upsert write path relies on (Convex OCC serializes concurrent
      // refreshes, so a double-insert would be a bug worth throwing on).
      const snapshot = await ctx.db
        .query("roomAnalyticsSnapshots")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .unique();

      if (snapshot && snapshot.computedAt >= room.lastActivityAt) {
        return {
          membership,
          room,
          completedIssues: snapshot.history.completedIssues,
          individualVotes: snapshot.history.individualVotes,
        };
      }

      return {
        membership,
        room,
        ...(await collectRoomHistoryRecords(ctx, room._id)),
      };
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
  const [history, existing] = await Promise.all([
    collectRoomHistoryRecords(ctx, roomId),
    ctx.db
      .query("roomAnalyticsSnapshots")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .first(),
  ]);
  const computedAt = Date.now();
  if (existing) {
    await ctx.db.patch("roomAnalyticsSnapshots", existing._id, { history, computedAt });
  } else {
    await ctx.db.insert("roomAnalyticsSnapshots", {
      roomId,
      history,
      computedAt,
    });
  }
}

/**
 * invalidateRoomAnalyticsSnapshots — drops the snapshot rows for rooms whose
 * history changed outside the round lifecycle: account-level user deletion and
 * identity merge delete or re-point `individualVotes` across rooms the user may
 * no longer belong to. Those paths deliberately don't bump room activity (an
 * account event is not room liveness), so the snapshot is deleted outright —
 * the next read falls back to the live scan until the room's next completion
 * rewrites it.
 */
export async function invalidateRoomAnalyticsSnapshots(
  ctx: MutationCtx,
  roomIds: Id<"rooms">[]
): Promise<void> {
  await Promise.all(
    [...new Set(roomIds)].map(async (roomId) => {
      const snapshot = await ctx.db
        .query("roomAnalyticsSnapshots")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .first();
      if (snapshot) await ctx.db.delete("roomAnalyticsSnapshots", snapshot._id);
    })
  );
}

/**
 * The per-voter history (individual vote snapshots) and the room snapshots
 * built from it. Either change rewrites a room's history, so the rooms'
 * snapshots are invalidated directly: an account going or folding is not
 * room activity, so the clock the snapshots' freshness reads doesn't move.
 */
export const analyticsUserRows: UserRows = {
  fields: ["individualVotes.userId", "roomAnalyticsSnapshots.history"],

  async forget(ctx, userId) {
    const rows = await ctx.db
      .query("individualVotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(rows.map((row) => ctx.db.delete("individualVotes", row._id)));
    await invalidateRoomAnalyticsSnapshots(ctx, rows.map((row) => row.roomId));
  },

  // Where both have a snapshot for the same issue, the account's is kept.
  async fold(ctx, from, into) {
    const rows = await ctx.db
      .query("individualVotes")
      .withIndex("by_user", (q) => q.eq("userId", from))
      .collect();
    for (const row of rows) {
      const own = await ctx.db
        .query("individualVotes")
        .withIndex("by_room_user_issue", (q) => q.eq("roomId", row.roomId).eq("userId", into).eq("issueId", row.issueId))
        .first();
      if (own) await ctx.db.delete("individualVotes", row._id);
      else await ctx.db.patch("individualVotes", row._id, { userId: into });
    }
    await invalidateRoomAnalyticsSnapshots(ctx, rows.map((row) => row.roomId));
  },
};

/**
 * getDashboard — the dashboard read: every panel of the Overview from one
 * load of the viewer's history, and the one place that says which numbers
 * window on what:
 *
 * - The panels window on when an issue was voted (`issue.votedAt`). An issue
 *   without a `votedAt` can't be placed in a window, so a range excludes it;
 *   with no range every completed issue counts. The voter alignment windows
 *   each vote on its own `votedAt`.
 * - The session list and the header totals over it (`summary`) window on
 *   membership tenure: the rooms the viewer joined in the range
 *   (`membership.joinedAt`, shown on each row), each reporting its lifetime
 *   issue stats.
 *
 * The two rules differ on purpose; making them one would change numbers people
 * see, so that is a product decision of its own. Live reads remain where the
 * data isn't history (ADR-0007): each listed room's participant count and the
 * voters' display names.
 */
export async function getDashboard(
  ctx: QueryCtx,
  user: Doc<"users"> | null,
  dateRange?: DateRange
): Promise<AnalyticsMath.Dashboard> {
  const history = await completedIssueHistory(ctx, user);
  const votes = votesCastIn(history, dateRange);
  const [sessions, voterNames] = await Promise.all([
    sessionsJoinedIn(ctx, history, dateRange),
    namesOf(ctx, votes),
  ]);
  return AnalyticsMath.dashboard({
    sessions,
    rooms: issuesVotedIn(history, dateRange),
    votes,
    voterNames,
  });
}

/** The Sessions page: the dashboard's session list on its own, by the same rule. */
export async function getUserSessions(
  ctx: QueryCtx,
  user: Doc<"users"> | null,
  dateRange?: DateRange
): Promise<AnalyticsMath.SessionSummary[]> {
  const history = await completedIssueHistory(ctx, user);
  return sessionsJoinedIn(ctx, history, dateRange);
}

/** Whether a moment falls in the range; with no range every moment does. */
function inRange(at: number | undefined, dateRange?: DateRange): boolean {
  if (!dateRange) return true;
  return at !== undefined && at >= dateRange.from && at <= dateRange.to;
}

/** The panels' window: each room's issues voted in the range. */
function issuesVotedIn(
  history: RoomHistory[],
  dateRange?: DateRange
): AnalyticsMath.RoomIssues[] {
  return history.map(({ room, completedIssues }) => ({
    roomId: room._id,
    roomName: room.name,
    issues: completedIssues.filter((issue) => inRange(issue.votedAt, dateRange)),
  }));
}

/** The voter alignment's window: the votes cast in the range. */
function votesCastIn(
  history: RoomHistory[],
  dateRange?: DateRange
): HistoryVoteRecord[] {
  return history.flatMap(({ individualVotes }) =>
    individualVotes.filter((vote) => inRange(vote.votedAt, dateRange))
  );
}

/**
 * The session list's window: a row for each room the viewer joined in the
 * range, with the room's lifetime issue stats and its participant count.
 */
async function sessionsJoinedIn(
  ctx: QueryCtx,
  history: RoomHistory[],
  dateRange?: DateRange
): Promise<AnalyticsMath.SessionSummary[]> {
  const summaries = await Promise.all(
    history
      .filter(({ membership }) => inRange(membership.joinedAt, dateRange))
      .map(async ({ membership, room, completedIssues }) => {
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

/** Batch-resolves the voters' display names. */
async function namesOf(
  ctx: QueryCtx,
  votes: HistoryVoteRecord[]
): Promise<Record<string, string>> {
  const userIds = [...new Set(votes.map((v) => v.userId))];
  const resolvedUsers = await Promise.all(userIds.map((id) => ctx.db.get("users", id)));
  const userNames: Record<string, string> = {};
  userIds.forEach((id, i) => {
    userNames[id] = resolvedUsers[i]?.name ?? "Unknown";
  });
  return userNames;
}
