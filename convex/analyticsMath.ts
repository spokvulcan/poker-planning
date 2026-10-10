/**
 * analyticsMath — the ONE pure computation layer behind the analytics dashboard.
 *
 * Every dashboard number, and every verdict a chart states (a trend and its
 * size), is projected here from plain rows, with no database access, so the
 * math is testable without a ctx (the summarize.ts precedent); the charts
 * only render them.
 * The model layer (model/analytics.ts) owns the single memberships → rooms →
 * history scan (`completedIssueHistory`); these functions own the projections,
 * and `dashboard` gathers them into the Overview's panels. Scan → project,
 * never scan-and-compute inline.
 *
 * Date-window semantics live in the dashboard read (`getDashboard`), not
 * here. Projections only decide which fields their metric requires (the
 * agreement trend needs an agreement, time to consensus a duration, and so
 * on), and skip rows that lack them.
 *
 * A numeric estimate is the deck's one numeric reading (`cardNumericValue`),
 * shared without a deck: a final estimate can be free text.
 */

import { cardNumericValue } from "./scales";

// ---------------------------------------------------------------------------
// Row types — minimal structural views of the table Docs, so projections are
// callable with plain objects in tests and with `Doc<"issues">` /
// `Doc<"individualVotes">` in the model layer.
// ---------------------------------------------------------------------------

export interface HistoryIssue {
  title: string;
  votedAt?: number;
  finalEstimate?: string;
  voteStats?: {
    agreement: number;
    timeToConsensusMs?: number;
  };
}

export interface HistoryVote {
  userId: string;
  cardLabel: string;
  consensusLabel?: string;
  deltaSteps?: number;
  votedAt: number;
}

/** A completed issue with the room context some projections group by. */
export interface RoomIssue {
  roomId: string;
  roomName: string;
  issue: HistoryIssue;
}

/** A room's completed issues, for per-session (per-room) projections. */
export interface RoomIssues {
  roomId: string;
  roomName: string;
  issues: HistoryIssue[];
}

// ---------------------------------------------------------------------------
// Result shapes (the registered queries' response field names — stable API).
// ---------------------------------------------------------------------------

export interface AgreementDataPoint {
  date: string; // ISO date string (YYYY-MM-DD)
  timestamp: number;
  agreement: number;
  issueTitle: string;
  roomName: string;
}

export interface VoteDistributionItem {
  value: string;
  count: number;
  percentage: number;
}

/**
 * A trend verdict, in the metric's own words: the second half of its series
 * against the first. `changePct` is the change of the second half's mean
 * relative to the first's, in whole percent; null when nothing was compared
 * (fewer than two values, or a first half averaging zero).
 */
export interface Trend<Direction extends string> {
  direction: Direction;
  changePct: number | null;
}

export interface TimeToConsensusStats {
  averageMs: number | null;
  medianMs: number | null;
  outliers: Array<{
    issueTitle: string;
    roomName: string;
    durationMs: number;
    multiplierVsAverage: number;
  }>;
  trendBySession: Array<{
    date: string;
    roomName: string;
    averageMs: number;
  }>;
  /** The later rooms' times against the earlier rooms', past a 10% change. */
  trend: Trend<"faster" | "stable" | "slower">;
}

export interface VoterAlignmentUser {
  userId: string;
  userName: string;
  totalVotes: number;
  agreesWithConsensus: number;
  agreementRate: number;
  averageDelta: number | null;
  tendency: "under" | "over" | "aligned" | "unknown";
}

export interface VoterAlignmentScatterPoint {
  userId: string;
  userName: string;
  x: number; // averageDelta
  y: number; // stdDev (consistency)
}

export interface VoterAlignmentData {
  users: VoterAlignmentUser[];
  scatterPoints: VoterAlignmentScatterPoint[];
}

export interface PredictabilitySession {
  roomName: string;
  date: string;
  estimatedPoints: number;
  issueCount: number;
  averageAgreement: number;
  averageTimeToConsensus: number;
}

export interface PredictabilityData {
  predictabilityScore: number | null;
  sessions: PredictabilitySession[];
  averageVelocityPerSession: number;
  /** The later rooms' points against the earlier rooms', past a 10% change. */
  velocityTrend: Trend<"increasing" | "stable" | "decreasing">;
  averageAgreement: number;
  /** The later rooms' agreement against the earlier rooms', past a 5% change. */
  agreementTrend: Trend<"improving" | "stable" | "declining">;
}

export interface DashboardSummary {
  totalSessions: number;
  totalIssuesEstimated: number;
  totalStoryPoints: number | null;
  averageAgreement: number | null;
}

/** The per-session issue stats a session-list row reports for one room. */
export interface SessionIssueStats {
  issuesCompleted: number;
  totalStoryPoints: number | null; // null if non-numeric scale
  averageAgreement: number | null;
}

/** One row of the session list: a room the viewer joined, over its lifetime. */
export interface SessionSummary extends SessionIssueStats {
  roomId: string;
  roomName: string;
  joinedAt: number;
  lastActivityAt: number;
  participantCount: number;
}

/**
 * The agreement chart: a point per issue, and the agreement trend it states,
 * which is the predictability card's.
 */
export interface AgreementTrendData {
  points: AgreementDataPoint[];
  trend: PredictabilityData["agreementTrend"];
}

/** Everything the dashboard Overview shows: one field per panel. */
export interface Dashboard {
  summary: DashboardSummary;
  sessions: SessionSummary[];
  agreementTrend: AgreementTrendData;
  voteDistribution: VoteDistributionItem[];
  timeToConsensus: TimeToConsensusStats;
  voterAlignment: VoterAlignmentData;
  predictability: PredictabilityData;
}

/**
 * The viewer's history as the dashboard read hands it over, already windowed
 * (model/analytics.ts getDashboard states the window rules): the session-list
 * rows, the issues voted in the window by room, the votes cast in it, and
 * those voters' display names.
 */
export interface DashboardHistory {
  sessions: SessionSummary[];
  rooms: RoomIssues[];
  votes: HistoryVote[];
  voterNames: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().split("T")[0];
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population stddev (divide by n, matching the original inline math). */
function stdDev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/**
 * Compares the first half vs second half of a numeric series. Goes `up` if
 * the second half's mean is more than `thresholdPct` percent above the
 * first's, `down` if as far below, "stable" otherwise. A first half averaging
 * zero has no relative change: any rise goes `up`.
 */
function trend<Up extends string, Down extends string>(
  values: number[],
  thresholdPct: number,
  { up, down }: { up: Up; down: Down }
): Trend<Up | "stable" | Down> {
  if (values.length < 2) return { direction: "stable", changePct: null };

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const firstAvg = mean(firstHalf);
  const secondAvg = mean(secondHalf);

  if (firstAvg === 0) {
    return { direction: secondAvg > 0 ? up : "stable", changePct: null };
  }

  const diffPct = ((secondAvg - firstAvg) / firstAvg) * 100;
  const direction =
    diffPct > thresholdPct ? up : diffPct < -thresholdPct ? down : "stable";

  return { direction, changePct: Math.round(diffPct) };
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

/** Agreement over time: one point per issue with an agreement, sorted by time. */
export function agreementTrend(entries: RoomIssue[]): AgreementDataPoint[] {
  const points: AgreementDataPoint[] = [];

  for (const { roomName, issue } of entries) {
    if (issue.votedAt && issue.voteStats?.agreement !== undefined) {
      points.push({
        date: isoDay(issue.votedAt),
        timestamp: issue.votedAt,
        agreement: issue.voteStats.agreement,
        issueTitle: issue.title,
        roomName,
      });
    }
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Distribution of final estimates. Counts whatever history it is given —
 * the dashboard read decides the window, so a ranged read never hands it
 * issues that lack a `votedAt` (the old inline copy leaked them into ranged
 * results).
 */
export function voteDistribution(
  issues: HistoryIssue[]
): VoteDistributionItem[] {
  const counts: Record<string, number> = {};
  let total = 0;

  for (const issue of issues) {
    if (issue.finalEstimate) {
      counts[issue.finalEstimate] = (counts[issue.finalEstimate] || 0) + 1;
      total += 1;
    }
  }

  const distribution = Object.entries(counts).map(([value, count]) => ({
    value,
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));

  return distribution.sort((a, b) => b.count - a.count);
}

/**
 * Time-to-consensus: average/median, >2x outliers, the per-session series and
 * its trend.
 */
export function timeToConsensus(entries: RoomIssue[]): TimeToConsensusStats {
  const issuesWithTime: Array<{
    issueTitle: string;
    roomId: string;
    roomName: string;
    durationMs: number;
    votedAt: number;
  }> = [];

  for (const { roomId, roomName, issue } of entries) {
    if (issue.voteStats?.timeToConsensusMs !== undefined && issue.votedAt) {
      issuesWithTime.push({
        issueTitle: issue.title,
        roomId,
        roomName,
        durationMs: issue.voteStats.timeToConsensusMs,
        votedAt: issue.votedAt,
      });
    }
  }

  if (issuesWithTime.length === 0) {
    return {
      averageMs: null,
      medianMs: null,
      outliers: [],
      trendBySession: [],
      trend: { direction: "stable", changePct: null },
    };
  }

  const durations = issuesWithTime.map((i) => i.durationMs);
  const averageMs = mean(durations);

  const sorted = [...durations].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;

  // Identify outliers (> 2x average)
  const outliers = issuesWithTime
    .filter((i) => i.durationMs > averageMs * 2)
    .map((i) => ({
      issueTitle: i.issueTitle,
      roomName: i.roomName,
      durationMs: i.durationMs,
      multiplierVsAverage: round(i.durationMs / averageMs, 1),
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  // Group by room+date for trend (use roomId as key to avoid name collisions)
  const bySessionKey: Record<
    string,
    { date: string; roomName: string; totalMs: number; count: number }
  > = {};

  for (const item of issuesWithTime) {
    const date = isoDay(item.votedAt);
    const key = `${date}::${item.roomId}`;
    if (!bySessionKey[key]) {
      bySessionKey[key] = { date, roomName: item.roomName, totalMs: 0, count: 0 };
    }
    bySessionKey[key].totalMs += item.durationMs;
    bySessionKey[key].count += 1;
  }

  const trendBySession = Object.values(bySessionKey)
    .map((s) => ({
      date: s.date,
      roomName: s.roomName,
      averageMs: Math.round(s.totalMs / s.count),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    averageMs: Math.round(averageMs),
    medianMs: Math.round(medianMs),
    outliers,
    trendBySession,
    trend: trend(
      trendBySession.map((s) => s.averageMs),
      10,
      { up: "slower", down: "faster" }
    ),
  };
}

/**
 * Voter alignment: per-user agreement with consensus, average delta in scale
 * steps, and the scatter (x = averageDelta, y = delta stdDev) for numeric
 * scales. `userNames` maps userId → display name (missing ids render
 * "Unknown").
 */
export function voterAlignment(
  votes: HistoryVote[],
  userNames: Record<string, string>
): VoterAlignmentData {
  if (votes.length === 0) {
    return { users: [], scatterPoints: [] };
  }

  const byUser = new Map<string, HistoryVote[]>();
  for (const vote of votes) {
    const existing = byUser.get(vote.userId) ?? [];
    existing.push(vote);
    byUser.set(vote.userId, existing);
  }

  const users: VoterAlignmentUser[] = [];
  const scatterPoints: VoterAlignmentScatterPoint[] = [];

  for (const [userId, userVotes] of byUser) {
    const userName = userNames[userId] ?? "Unknown";

    const totalVotes = userVotes.length;
    const agreesWithConsensus = userVotes.filter(
      (v) => v.consensusLabel !== undefined && v.cardLabel === v.consensusLabel
    ).length;
    const agreementRate =
      totalVotes > 0 ? Math.round((agreesWithConsensus / totalVotes) * 100) : 0;

    // Average delta / consistency from deltaSteps (only votes with delta)
    const deltas = userVotes
      .map((v) => v.deltaSteps)
      .filter((d): d is number => d !== undefined);

    const averageDelta =
      deltas.length > 0 ? round(mean(deltas), 2) : null;
    const stdDevValue = deltas.length > 1 ? round(stdDev(deltas), 2) : 0;

    const tendency: "under" | "over" | "aligned" | "unknown" =
      averageDelta === null
        ? "unknown"
        : averageDelta < -0.5
          ? "under"
          : averageDelta > 0.5
            ? "over"
            : "aligned";

    users.push({
      userId,
      userName,
      totalVotes,
      agreesWithConsensus,
      agreementRate,
      averageDelta,
      tendency,
    });

    // Only include in scatter chart if we have delta data (numeric scales)
    if (averageDelta !== null) {
      scatterPoints.push({
        userId,
        userName,
        x: averageDelta,
        y: stdDevValue,
      });
    }
  }

  // Sort users by total votes descending
  users.sort((a, b) => b.totalVotes - a.totalVotes);
  const votesMap = new Map(users.map((u) => [u.userId, u.totalVotes]));
  scatterPoints.sort(
    (a, b) => (votesMap.get(b.userId) ?? 0) - (votesMap.get(a.userId) ?? 0)
  );

  return { users, scatterPoints };
}

/**
 * Sprint predictability score and related metrics.
 *
 * Score formula:
 *   velocityConsistency = 1 - (stdDev(points) / mean(points))
 *   score = avgAgreement * 0.6 + velocityConsistency * 100 * 0.4
 *   clamped to 0-100
 *
 * Returns null score when < 3 sessions have story points.
 */
export function predictability(rooms: RoomIssues[]): PredictabilityData {
  // One "session" per room over its usable history (issues need a votedAt to
  // be placed on the timeline at all).
  const sessions: PredictabilitySession[] = [];

  for (const { roomName, issues } of rooms) {
    const usable = issues.filter((i) => i.votedAt !== undefined);
    if (usable.length === 0) continue;

    // Story points
    const numericEstimates = usable
      .map((i) => (i.finalEstimate ? cardNumericValue(i.finalEstimate) : undefined))
      .filter((v): v is number => v !== undefined);
    const estimatedPoints =
      numericEstimates.length > 0
        ? numericEstimates.reduce((sum, v) => sum + v, 0)
        : 0;

    // Agreement
    const agreements = usable
      .map((i) => i.voteStats?.agreement)
      .filter((a): a is number => a !== undefined);
    const averageAgreement =
      agreements.length > 0 ? Math.round(mean(agreements)) : 0;

    // Time to consensus
    const consensusTimes = usable
      .map((i) => i.voteStats?.timeToConsensusMs)
      .filter((t): t is number => t !== undefined);
    const averageTimeToConsensus =
      consensusTimes.length > 0 ? Math.round(mean(consensusTimes)) : 0;

    // Session date = latest votedAt among completed issues in this room
    const latestVotedAt = Math.max(...usable.map((i) => i.votedAt!));

    sessions.push({
      roomName,
      date: isoDay(latestVotedAt),
      estimatedPoints,
      issueCount: usable.length,
      averageAgreement,
      averageTimeToConsensus,
    });
  }

  sessions.sort((a, b) => a.date.localeCompare(b.date));

  // Sessions with story points (for velocity metrics)
  const sessionsWithPoints = sessions.filter((s) => s.estimatedPoints > 0);

  const velocities = sessionsWithPoints.map((s) => s.estimatedPoints);
  const averageVelocityPerSession =
    velocities.length > 0 ? round(mean(velocities), 1) : 0;
  const velocityTrend = trend(velocities, 10, {
    up: "increasing",
    down: "decreasing",
  });

  const allAgreements = sessions
    .map((s) => s.averageAgreement)
    .filter((a) => a > 0);
  const overallAgreement =
    allAgreements.length > 0 ? Math.round(mean(allAgreements)) : 0;

  const agreementTrend = trend(allAgreements, 5, {
    up: "improving",
    down: "declining",
  });

  // Predictability score (need at least 3 sessions with points)
  let predictabilityScore: number | null = null;

  if (sessionsWithPoints.length >= 3) {
    const velocityMean = mean(velocities);
    const velocityStdDev = stdDev(velocities);

    const velocityConsistency =
      velocityMean > 0 ? 1 - velocityStdDev / velocityMean : 0;
    const rawScore =
      overallAgreement * 0.6 + velocityConsistency * 100 * 0.4;

    predictabilityScore = Math.round(Math.min(100, Math.max(0, rawScore)));
  }

  return {
    predictabilityScore,
    sessions,
    averageVelocityPerSession,
    velocityTrend,
    averageAgreement: overallAgreement,
    agreementTrend,
  };
}

/** Dashboard header totals over the session list. */
export function dashboardSummary(sessions: SessionIssueStats[]): DashboardSummary {
  const totalSessions = sessions.length;
  const totalIssuesEstimated = sessions.reduce(
    (sum, s) => sum + s.issuesCompleted,
    0
  );

  // Sum story points (only if we have numeric data)
  const sessionsWithPoints = sessions.filter((s) => s.totalStoryPoints !== null);
  const totalStoryPoints =
    sessionsWithPoints.length > 0
      ? sessionsWithPoints.reduce((sum, s) => sum + (s.totalStoryPoints ?? 0), 0)
      : null;

  // Average agreement across all sessions
  const sessionsWithAgreement = sessions.filter(
    (s) => s.averageAgreement !== null
  );
  const averageAgreement =
    sessionsWithAgreement.length > 0
      ? Math.round(
          sessionsWithAgreement.reduce(
            (sum, s) => sum + (s.averageAgreement ?? 0),
            0
          ) / sessionsWithAgreement.length
        )
      : null;

  return {
    totalSessions,
    totalIssuesEstimated,
    totalStoryPoints,
    averageAgreement,
  };
}

/** Per-room issue rollup for one session-history row. */
export function sessionIssueStats(issues: HistoryIssue[]): SessionIssueStats {
  // Total story points (numeric estimates only)
  const numericEstimates = issues
    .map((i) => (i.finalEstimate ? cardNumericValue(i.finalEstimate) : undefined))
    .filter((v): v is number => v !== undefined);
  const totalStoryPoints =
    numericEstimates.length > 0
      ? numericEstimates.reduce((sum, v) => sum + v, 0)
      : null;

  const agreements = issues
    .map((i) => i.voteStats?.agreement)
    .filter((a): a is number => a !== undefined);
  const averageAgreement =
    agreements.length > 0 ? Math.round(mean(agreements)) : null;

  return {
    issuesCompleted: issues.length,
    totalStoryPoints,
    averageAgreement,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * How a duration reads, on the dashboard and in the issue export: to the
 * nearest second, with minutes from the first one ("2m 34s").
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

// ---------------------------------------------------------------------------
// The Overview
// ---------------------------------------------------------------------------

/**
 * Every panel of the Overview, each from its own projection. The header
 * totals the session list; the charts read the windowed issues and votes.
 *
 * The agreement chart plots its points day by day but states the
 * predictability card's agreement trend, room against room (#391): the page
 * shows one agreement trend.
 */
export function dashboard(history: DashboardHistory): Dashboard {
  const entries: RoomIssue[] = history.rooms.flatMap(
    ({ roomId, roomName, issues }) =>
      issues.map((issue) => ({ roomId, roomName, issue }))
  );
  const predictabilityData = predictability(history.rooms);
  return {
    summary: dashboardSummary(history.sessions),
    sessions: history.sessions,
    agreementTrend: {
      points: agreementTrend(entries),
      trend: predictabilityData.agreementTrend,
    },
    voteDistribution: voteDistribution(history.rooms.flatMap((r) => r.issues)),
    timeToConsensus: timeToConsensus(entries),
    voterAlignment: voterAlignment(history.votes, history.voterNames),
    predictability: predictabilityData,
  };
}

/** The dashboard of a viewer with no history: every panel's empty state. */
export const EMPTY_DASHBOARD: Dashboard = dashboard({
  sessions: [],
  rooms: [],
  votes: [],
  voterNames: {},
});
