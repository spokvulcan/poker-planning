import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import * as Rooms from "./rooms";
import * as VotingRound from "./votingRound";
import {
  MAX_ISSUE_TITLE_LENGTH,
  MAX_ISSUES_PER_ROOM,
} from "../constants";

export type IssueStatus = "pending" | "voting" | "completed";

/**
 * Validates an issue title (trims, enforces non-empty and a length cap).
 * Jira-imported titles ("KEY - summary") fit comfortably under the cap.
 */
export function validateIssueTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Issue title is required");
  }
  if (trimmed.length > MAX_ISSUE_TITLE_LENGTH) {
    throw new Error(
      `Issue title must be ${MAX_ISSUE_TITLE_LENGTH} characters or less`
    );
  }
  return trimmed;
}

export interface ExportableIssue {
  title: string;
  finalEstimate: string | null;
  status: IssueStatus;
  votedAt: string | null; // ISO timestamp
  // Vote statistics
  average: number | null;
  median: number | null;
  agreement: number | null;
  voteCount: number | null;
  // Discussion notes
  notes: string | null;
}

export interface EnhancedExportableIssue extends ExportableIssue {
  timeToConsensusMs: number | null;
  timeToConsensusFormatted: string | null; // "2m 34s"
  votingRounds: number | null;
  individualVotes: Array<{
    userName: string;
    vote: string;
    deltaFromConsensus: number | null;
  }> | null;
  externalUrl: string | null; // placeholder for Epics 6-7
  externalId: string | null; // placeholder for Epics 6-7
}

/**
 * Lists all issues for a room, ordered by their order field
 */
export async function listIssues(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Doc<"issues">[]> {
  return await ctx.db
    .query("issues")
    .withIndex("by_room_order", (q) => q.eq("roomId", roomId))
    .collect();
}

/**
 * Gets the current issue being voted on
 */
export async function getCurrentIssue(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Doc<"issues"> | null> {
  const room = await ctx.db.get(roomId);
  if (!room?.currentIssueId) return null;
  return await ctx.db.get(room.currentIssueId);
}

/**
 * Canonical issue creation, shared by local creates and integration imports:
 * enforces the per-room cap, allocates the next sequential ID, advances the
 * room counter exactly once, and appends after the current max order.
 */
export async function createIssueInRoom(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; title: string }
): Promise<Id<"issues">> {
  const room = await ctx.db.get(args.roomId);
  if (!room) throw new Error("Room not found");

  // Get next sequential ID
  const nextNumber = (room.nextIssueNumber ?? 0) + 1;

  // Get current max order
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
    .collect();
  if (issues.length >= MAX_ISSUES_PER_ROOM) {
    throw new Error(`Rooms are limited to ${MAX_ISSUES_PER_ROOM} issues`);
  }
  const maxOrder = issues.length > 0 ? Math.max(...issues.map((i) => i.order)) : 0;

  // Update room's next issue number
  await ctx.db.patch(args.roomId, {
    nextIssueNumber: nextNumber,
  });
  await Rooms.updateRoomActivity(ctx, args.roomId);

  // Create the issue
  return await ctx.db.insert("issues", {
    roomId: args.roomId,
    sequentialId: nextNumber,
    title: validateIssueTitle(args.title),
    status: "pending",
    createdAt: Date.now(),
    order: maxOrder + 1,
  });
}

/**
 * Creates a new issue with an auto-incremented sequential ID
 */
export async function createIssue(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; title: string }
): Promise<Id<"issues">> {
  return await createIssueInRoom(ctx, args);
}

/**
 * Updates an issue's title
 */
export async function updateIssueTitle(
  ctx: MutationCtx,
  args: { issueId: Id<"issues">; title: string }
): Promise<void> {
  const issue = await ctx.db.get(args.issueId);
  if (!issue) throw new Error("Issue not found");

  await ctx.db.patch(args.issueId, { title: validateIssueTitle(args.title) });

  // Update room activity
  await Rooms.updateRoomActivity(ctx, issue.roomId);
}

/**
 * Updates an issue's final estimate (manual override after voting)
 */
export async function updateIssueEstimate(
  ctx: MutationCtx,
  args: { issueId: Id<"issues">; finalEstimate: string }
): Promise<void> {
  const issue = await ctx.db.get(args.issueId);
  if (!issue) throw new Error("Issue not found");

  await ctx.db.patch(args.issueId, { finalEstimate: args.finalEstimate });

  // Update room activity
  await Rooms.updateRoomActivity(ctx, issue.roomId);
}

/**
 * Removes an issue
 */
export async function removeIssue(
  ctx: MutationCtx,
  issueId: Id<"issues">
): Promise<void> {
  const issue = await ctx.db.get(issueId);
  if (!issue) throw new Error("Issue not found");

  await Rooms.updateRoomActivity(ctx, issue.roomId);

  // Deleting the issue being voted on ends the round cleanly: delegate to the
  // round's abandon (drops the target to a Quick Vote, cancels the countdown,
  // clears votes) before the issue and its records are removed below.
  const room = await ctx.db.get(issue.roomId);
  if (room?.currentIssueId === issueId) {
    await VotingRound.abandon(ctx, issue.roomId);
  }

  // Delete associated voting timestamps
  const timestamps = await ctx.db
    .query("votingTimestamps")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .collect();
  await Promise.all(timestamps.map((ts) => ctx.db.delete(ts._id)));

  // Delete associated individual vote snapshots
  const individualVotes = await ctx.db
    .query("individualVotes")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .collect();
  await Promise.all(individualVotes.map((iv) => ctx.db.delete(iv._id)));

  await ctx.db.delete(issueId);
}

/**
 * Gets issues formatted for CSV export
 */
export async function getIssuesForExport(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<ExportableIssue[]> {
  const issues = await listIssues(ctx, roomId);

  // Fetch all notes for room in a single query (avoid N+1)
  const noteNodes = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_type", (q) => q.eq("roomId", roomId).eq("type", "note"))
    .collect();

  // Build lookup map: issueId -> note content
  const notesByIssueId = new Map<string, string | null>(
    noteNodes.map((n) => [n.data?.issueId as string, n.data?.content ?? null])
  );

  return issues.map((issue) => ({
    title: issue.title,
    finalEstimate: issue.finalEstimate ?? null,
    status: issue.status,
    votedAt: issue.votedAt ? new Date(issue.votedAt).toISOString() : null,
    average: issue.voteStats?.average ?? null,
    median: issue.voteStats?.median ?? null,
    agreement: issue.voteStats?.agreement ?? null,
    voteCount: issue.voteStats?.voteCount ?? null,
    notes: notesByIssueId.get(issue._id) ?? null,
  }));
}

/**
 * Reorders issues (for drag-and-drop)
 */
export async function reorderIssues(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; issueIds: Id<"issues">[] }
): Promise<void> {
  // Authorization was checked against args.roomId, so every reordered issue
  // must belong to that room — otherwise issue IDs from another room could be
  // smuggled into the array to scramble its ordering.
  const issues = await Promise.all(
    args.issueIds.map((issueId) => ctx.db.get(issueId))
  );
  for (const issue of issues) {
    if (!issue) throw new Error("Issue not found");
    if (issue.roomId !== args.roomId) {
      throw new Error("Issue does not belong to this room");
    }
  }

  // Update order for each issue
  await Promise.all(
    args.issueIds.map((issueId, index) =>
      ctx.db.patch(issueId, { order: index + 1 })
    )
  );

  // Update room activity
  await Rooms.updateRoomActivity(ctx, args.roomId);
}

/**
 * Formats milliseconds into a human-readable duration string (e.g., "2m 34s")
 */
function formatDurationMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Gets issues with enhanced data for export (time-to-consensus, individual votes, voting rounds)
 */
export async function getEnhancedIssuesForExport(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<EnhancedExportableIssue[]> {
  // Get base export data
  const baseIssues = await getIssuesForExport(ctx, roomId);
  const issues = await listIssues(ctx, roomId);

  // Batch-query votingTimestamps by room (single query, group by issueId)
  const allTimestamps = await ctx.db
    .query("votingTimestamps")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();

  const timestampsByIssue = new Map<string, typeof allTimestamps>();
  for (const ts of allTimestamps) {
    const key = ts.issueId as string;
    const existing = timestampsByIssue.get(key) ?? [];
    existing.push(ts);
    timestampsByIssue.set(key, existing);
  }

  // Batch-query individualVotes by room (single query, group by issueId)
  const allIndividualVotes = await ctx.db
    .query("individualVotes")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();

  const votesByIssue = new Map<string, typeof allIndividualVotes>();
  for (const iv of allIndividualVotes) {
    const key = iv.issueId as string;
    const existing = votesByIssue.get(key) ?? [];
    existing.push(iv);
    votesByIssue.set(key, existing);
  }

  // Batch-query issueLinks for all issues in this room
  const allIssueLinks = await Promise.all(
    issues.map((issue) =>
      ctx.db
        .query("issueLinks")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .first()
    )
  );
  const issueLinkMap = new Map<string, { externalUrl: string; externalId: string }>();
  for (let i = 0; i < issues.length; i++) {
    const link = allIssueLinks[i];
    if (link) {
      issueLinkMap.set(issues[i]._id as string, {
        externalUrl: link.externalUrl,
        externalId: link.externalId,
      });
    }
  }

  // Collect unique userIds and batch-resolve names
  const uniqueUserIds = new Set<Id<"users">>();
  for (const iv of allIndividualVotes) {
    uniqueUserIds.add(iv.userId);
  }
  const userDocs = await Promise.all(
    [...uniqueUserIds].map((uid) => ctx.db.get(uid))
  );
  const userNames = new Map<string, string>();
  for (const doc of userDocs) {
    if (doc) userNames.set(doc._id as string, doc.name);
  }

  // Build enhanced issues
  return issues.map((issue, index) => {
    const base = baseIssues[index];
    const issueId = issue._id as string;

    // Time-to-consensus from voteStats (computed by the round module when it
    // completed the issue — see completeTargetIssue in model/votingRound.ts)
    const timeToConsensusMs = issue.voteStats?.timeToConsensusMs ?? null;
    const timeToConsensusFormatted =
      timeToConsensusMs !== null ? formatDurationMs(timeToConsensusMs) : null;

    // Voting rounds count
    const timestamps = timestampsByIssue.get(issueId) ?? [];
    const votingRounds = timestamps.length > 0 ? timestamps.length : null;

    // Individual votes
    const issueVotes = votesByIssue.get(issueId) ?? [];
    const individualVotes =
      issueVotes.length > 0
        ? issueVotes.map((iv) => ({
            userName: userNames.get(iv.userId as string) ?? "Unknown",
            vote: iv.cardLabel,
            deltaFromConsensus: iv.deltaSteps ?? null,
          }))
        : null;

    return {
      ...base,
      timeToConsensusMs,
      timeToConsensusFormatted,
      votingRounds,
      individualVotes,
      externalUrl: issueLinkMap.get(issueId)?.externalUrl ?? null,
      externalId: issueLinkMap.get(issueId)?.externalId ?? null,
    };
  });
}
