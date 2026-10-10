import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import * as Canvas from "./canvas";
import * as Rooms from "./rooms";
import * as VotingRound from "./votingRound";
import { refusal, requireValid } from "./refusal";
import { ISSUE_TITLE, MAX_ISSUES_PER_ROOM } from "../constants";
import { formatDuration } from "../analyticsMath";

export type IssueStatus = "pending" | "voting" | "completed";

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
  const room = await ctx.db.get("rooms", roomId);
  if (!room?.currentIssueId) return null;
  return await ctx.db.get("issues", room.currentIssueId);
}

/** Where an issue lives in a tracker: the provider, its key there, and its page. */
export type IssueLink = Pick<Doc<"issueLinks">, "provider" | "externalId" | "externalUrl">;

/**
 * What admitting an issue did: a new issue, or the room's issue that already
 * holds the link (a tracker issue is in a room at most once).
 */
export type Admission =
  | { kind: "admitted"; issueId: Id<"issues"> }
  | { kind: "alreadyInRoom"; issueId: Id<"issues"> };

/**
 * The room's issue holding this link, found through the room's links. A link
 * whose issue is gone holds nothing: an issue's links are deleted with it,
 * but earlier deletions left theirs to the daily orphan sweep.
 *
 * Rows written before `issueLinks.roomId` existed are invisible to by_room
 * until backfillIssueLinksRoomId tags them, and the field is still optional,
 * so nothing proves that has run in production. Until it is required, this
 * link's untagged rows are read through by_external (a handful: one per room
 * holding the tracker issue) and their issue says whose they are.
 */
async function issueHoldingLink(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  link: IssueLink
): Promise<Id<"issues"> | null> {
  const roomLinks = await ctx.db
    .query("issueLinks")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  for (const row of roomLinks) {
    if (row.provider !== link.provider || row.externalId !== link.externalId) continue;
    if (await ctx.db.get("issues", row.issueId)) return row.issueId;
  }

  const sameLink = await ctx.db
    .query("issueLinks")
    .withIndex("by_external", (q) =>
      q.eq("provider", link.provider).eq("externalId", link.externalId)
    )
    .collect();
  for (const row of sameLink) {
    if (row.roomId !== undefined) continue;
    const issue = await ctx.db.get("issues", row.issueId);
    if (issue?.roomId === roomId) return issue._id;
  }
  return null;
}

/**
 * The one way an issue enters a room's backlog, typed in the room or brought
 * from a tracker with its link: the title rule, the per-room cap, a tracker
 * issue at most once per room, the next sequential ID (the room counter
 * advances exactly once), an order after the current last, and the link row.
 * A full room or a link that isn't https is refused in words people see.
 */
export async function admitIssue(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; title: string; link?: IssueLink }
): Promise<Admission> {
  const room = await ctx.db.get("rooms", args.roomId);
  if (!room) throw new Error("Room not found");

  if (args.link) {
    // The room UI renders the link as an anchor href: only a real web URL,
    // so a malicious integration connection can't inject a javascript: link.
    if (!args.link.externalUrl.startsWith("https://")) {
      throw refusal("forbidden", "Issue links must be https:// URLs");
    }
    // Ahead of the cap: a tracker issue already in a full room is reported
    // as in the room, not refused.
    const holder = await issueHoldingLink(ctx, args.roomId, args.link);
    if (holder) return { kind: "alreadyInRoom", issueId: holder };
  }

  // Get next sequential ID
  const nextNumber = (room.nextIssueNumber ?? 0) + 1;

  // Get current max order
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
    .collect();
  if (issues.length >= MAX_ISSUES_PER_ROOM) {
    throw refusal("forbidden", `Rooms are limited to ${MAX_ISSUES_PER_ROOM} issues`);
  }
  const maxOrder = issues.length > 0 ? Math.max(...issues.map((i) => i.order)) : 0;

  // Update room's next issue number
  await ctx.db.patch("rooms", args.roomId, {
    nextIssueNumber: nextNumber,
  });
  await Rooms.updateRoomActivity(ctx, args.roomId);

  // Create the issue
  const issueId = await ctx.db.insert("issues", {
    roomId: args.roomId,
    sequentialId: nextNumber,
    title: requireValid(ISSUE_TITLE, args.title),
    status: "pending",
    createdAt: Date.now(),
    order: maxOrder + 1,
  });

  if (args.link) {
    // roomId-tagged so the room's links come from one by_room read.
    await ctx.db.insert("issueLinks", {
      issueId,
      roomId: args.roomId,
      provider: args.link.provider,
      externalId: args.link.externalId,
      externalUrl: args.link.externalUrl,
      lastSyncedAt: Date.now(),
    });
  }

  return { kind: "admitted", issueId };
}

/** What a tracker says became of one of its issues. */
export type TrackerChange =
  | { kind: "retitled"; title: string }
  | { kind: "deleted" };

/**
 * Follows a change in a tracker to every issue holding the link, in every
 * room it was brought into: a tracker issue can sit in several rooms on
 * purpose. A rename retitles them by the title rule, and moves a room's
 * activity clock only where the title changed (it feeds the room's analytics
 * history, so a fresh snapshot mustn't serve the old one). A deletion drops
 * every link to it and keeps the issues. A link whose issue is gone holds
 * nothing and is passed over.
 *
 * The rows come through by_external, which reaches those written before
 * links carried their room too: a handful, one per room holding the issue.
 */
export async function followTrackerChange(
  ctx: MutationCtx,
  link: Pick<IssueLink, "provider" | "externalId">,
  change: TrackerChange
): Promise<void> {
  const rows = await ctx.db
    .query("issueLinks")
    .withIndex("by_external", (q) =>
      q.eq("provider", link.provider).eq("externalId", link.externalId)
    )
    .collect();
  if (change.kind === "deleted") {
    await Promise.all(rows.map((row) => ctx.db.delete("issueLinks", row._id)));
    return;
  }

  // A tracker's title is fitted to the title rule, never refused; one that
  // fits as nothing leaves the titles as they are.
  const title = ISSUE_TITLE.fit(change.title);
  for (const row of rows) {
    const issue = await ctx.db.get("issues", row.issueId);
    if (!issue) continue;
    if (title && issue.title !== title) {
      await ctx.db.patch("issues", issue._id, { title });
      await Rooms.updateRoomActivity(ctx, issue.roomId);
    }
    await ctx.db.patch("issueLinks", row._id, { lastSyncedAt: Date.now() });
  }
}

/**
 * Updates an issue's title
 */
export async function updateIssueTitle(
  ctx: MutationCtx,
  args: { issueId: Id<"issues">; title: string }
): Promise<void> {
  const issue = await ctx.db.get("issues", args.issueId);
  if (!issue) throw new Error("Issue not found");

  await ctx.db.patch("issues", args.issueId, { title: requireValid(ISSUE_TITLE, args.title) });

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
  const issue = await ctx.db.get("issues", args.issueId);
  if (!issue) throw new Error("Issue not found");

  await ctx.db.patch("issues", args.issueId, { finalEstimate: args.finalEstimate });

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
  const issue = await ctx.db.get("issues", issueId);
  if (!issue) throw new Error("Issue not found");

  // Deleting the issue being voted on ends the round cleanly: delegate to the
  // round's abandon (drops the target to a Quick Vote, cancels the countdown,
  // clears votes — and bumps room activity itself) before the issue and its
  // records are removed below.
  const room = await ctx.db.get("rooms", issue.roomId);
  if (room?.currentIssueId === issueId) {
    await VotingRound.abandon(ctx, issue.roomId);
  } else {
    await Rooms.updateRoomActivity(ctx, issue.roomId);
  }

  // Delete associated voting timestamps
  const timestamps = await ctx.db
    .query("votingTimestamps")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .collect();
  await Promise.all(timestamps.map((ts) => ctx.db.delete("votingTimestamps", ts._id)));

  // Delete associated individual vote snapshots
  const individualVotes = await ctx.db
    .query("individualVotes")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .collect();
  await Promise.all(individualVotes.map((iv) => ctx.db.delete("individualVotes", iv._id)));

  // Its discussion note goes with it.
  await Canvas.issueRemoved(ctx, issue.roomId, issueId);

  await deleteIssueWithLinks(ctx, issueId);
}

/**
 * Deletes an issue's row and its links: a link leaves with its issue. Links
 * are found by issue, so rows from before links carried their room go too.
 * Returns how many rows went. The rest of what an issue owns (its timing,
 * vote snapshots and note) is the caller's: removeIssue clears it issue by
 * issue, the room cascade room by room.
 */
export async function deleteIssueWithLinks(
  ctx: MutationCtx,
  issueId: Id<"issues">
): Promise<number> {
  const links = await ctx.db
    .query("issueLinks")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .collect();
  await Promise.all([
    ...links.map((link) => ctx.db.delete("issueLinks", link._id)),
    ctx.db.delete("issues", issueId),
  ]);
  return links.length + 1;
}

/**
 * Gets issues formatted for CSV export
 */
export async function getIssuesForExport(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<ExportableIssue[]> {
  const issues = await listIssues(ctx, roomId);

  // Every note of the room in one read (avoid N+1).
  const notesByIssueId = await Canvas.noteContents(ctx, roomId);

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
    args.issueIds.map((issueId) => ctx.db.get("issues", issueId))
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
      ctx.db.patch("issues", issueId, { order: index + 1 })
    )
  );

  // Update room activity
  await Rooms.updateRoomActivity(ctx, args.roomId);
}

/**
 * Gets issues with enhanced data for export (time-to-consensus, individual votes, voting rounds)
 */
/**
 * The room's issue links, keyed by issueId — one by_room fetch, grouped in
 * memory (first link per issue wins; duplicates shouldn't exist). by_room is
 * authoritative: link rows are tagged with roomId at creation, and rows
 * predating the field are healed by the backfillIssueLinksRoomId migration —
 * NOT by per-issue fallback queries, which turn a room with no links into a
 * full N+1.
 */
export async function issueLinksForRoom(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Map<string, Doc<"issueLinks">>> {
  const links = await ctx.db
    .query("issueLinks")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  const byIssue = new Map<string, Doc<"issueLinks">>();
  for (const link of links) {
    const key = link.issueId as string;
    if (!byIssue.has(key)) byIssue.set(key, link);
  }
  return byIssue;
}

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

  // The room's issue links come from one by_room fetch (authoritative — see
  // issueLinksForRoom), grouped in memory; no per-issue queries at all.
  const issueLinkMap = await issueLinksForRoom(ctx, roomId);

  // Collect unique userIds and batch-resolve names
  const uniqueUserIds = new Set<Id<"users">>();
  for (const iv of allIndividualVotes) {
    uniqueUserIds.add(iv.userId);
  }
  const userDocs = await Promise.all(
    [...uniqueUserIds].map((uid) => ctx.db.get("users", uid))
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
      timeToConsensusMs !== null ? formatDuration(timeToConsensusMs) : null;

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
