import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import * as Rooms from "./rooms";
import * as Issues from "./issues";
import * as Countdown from "./countdown";
import * as Canvas from "./canvas";
import * as Votes from "./votes";
import { summarize } from "../summarize";
import { SPECIAL_CARDS, VotingScale } from "../scales";

/**
 * VotingRound — the module that owns the round's lifecycle (ADR-0002).
 * Sole writer of the round's state; transitions land here over the coming steps.
 */

/**
 * start — begin a round on a target (an issue) or a target-less Quick Vote
 * (`issueId` omitted). Moves the phase to `voting`, clears prior votes, marks
 * an issue target as `voting`, and (issue-backed, non-demo only) opens a fresh
 * timed round. Reverts any previous, different issue target to `pending`.
 */
export async function start(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; issueId?: Id<"issues"> }
): Promise<void> {
  const room = await ctx.db.get(args.roomId);
  if (!room) throw new Error("Room not found");

  if (args.issueId) {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");
  }

  // Revert a different previous issue target back to pending, closing its round.
  if (room.currentIssueId && room.currentIssueId !== args.issueId) {
    const previous = await ctx.db.get(room.currentIssueId);
    if (previous && previous.status === "voting") {
      await Issues.closeOpenTimestamp(ctx, room.currentIssueId);
      await ctx.db.patch(room.currentIssueId, { status: "pending" });
    }
  }

  // Mark the new issue target as voting (Quick Vote has no issue status).
  if (args.issueId) {
    await ctx.db.patch(args.issueId, { status: "voting" });
  }

  // Cancel any countdown left over from the previous round.
  await Countdown.cancel(ctx, args.roomId);

  // Move to a fresh `voting` phase on the new target.
  await ctx.db.patch(args.roomId, {
    currentIssueId: args.issueId,
    isGameOver: false,
    lastActivityAt: Date.now(),
  });

  await clearRoomVotes(ctx, args.roomId);

  if (shouldRecordTiming(room, args.issueId)) {
    await openTimingRecord(ctx, args.roomId, args.issueId!);
  }
}

/**
 * reset — start a fresh round on the SAME target (revealed -> voting). Clears
 * prior votes and, for an issue-backed (non-demo) round, opens a new timed
 * round (incrementing the round number).
 */
export async function reset(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get(roomId);
  if (!room) throw new Error("Room not found");

  if (room.currentIssueId) {
    const issue = await ctx.db.get(room.currentIssueId);
    if (issue && (issue.status === "voting" || issue.status === "completed")) {
      // A mid-vote reset leaves an open round; close it before opening a fresh
      // one so durations don't overlap.
      if (issue.status === "voting" && shouldRecordTiming(room, room.currentIssueId)) {
        await Issues.closeOpenTimestamp(ctx, room.currentIssueId);
      }
      await ctx.db.patch(room.currentIssueId, { status: "voting" });
      if (shouldRecordTiming(room, room.currentIssueId)) {
        await openTimingRecord(ctx, roomId, room.currentIssueId);
      }
    }
  }

  await Countdown.cancel(ctx, roomId);
  await ctx.db.patch(roomId, { isGameOver: false, lastActivityAt: Date.now() });
  await clearRoomVotes(ctx, roomId);
}

/**
 * reveal — settle the round: flip to `revealed`, cancel the countdown, and run
 * the reveal effects. For an issue-backed round it snapshots the summary onto
 * the issue (final estimate + stats), records per-voter alignment, closes the
 * timed round, schedules the Jira push when linked with auto-push, and upserts
 * the canvas results node.
 */
export async function reveal(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get(roomId);
  if (!room) throw new Error("Room not found");

  // Cancel the countdown as one unit, then settle to `revealed`.
  await Countdown.cancel(ctx, roomId);
  await ctx.db.patch(roomId, { isGameOver: true, lastActivityAt: Date.now() });

  // Reveal effect: results node on canvas rooms.
  if (room.roomType === "canvas") {
    await Canvas.upsertResultsNode(ctx, { roomId });
  }

  // Issue-coupled settle (only when the target is an issue).
  if (room.currentIssueId) {
    // One summary feeds the snapshot, the export, and the client panel.
    const votes = await Votes.getRoomVotes(ctx, roomId);
    const summary = summarize(votes, room.votingScale);

    if (summary.consensus) {
      await Issues.completeIssueVoting(ctx, {
        roomId,
        issueId: room.currentIssueId,
        finalEstimate: summary.consensus,
        voteStats: summary.stats,
      });
    }

    // Per-voter alignment snapshot for analytics/export.
    await snapshotVoterAlignment(ctx, {
      roomId,
      issueId: room.currentIssueId,
      consensusLabel: summary.consensus,
      votingScale: room.votingScale,
    });

    // Reveal effect: push the estimate to a linked Jira issue when auto-push is on.
    if (summary.consensus) {
      await scheduleJiraPushIfEnabled(
        ctx,
        roomId,
        room.currentIssueId,
        summary.consensus
      );
    }
  }
}

/**
 * Snapshots each non-special vote as an `individualVotes` row for voter-alignment
 * analytics/export. Idempotent — clears prior snapshots for the issue first.
 */
async function snapshotVoterAlignment(
  ctx: MutationCtx,
  args: {
    roomId: Id<"rooms">;
    issueId: Id<"issues">;
    consensusLabel: string | null;
    votingScale: VotingScale | undefined;
  }
): Promise<void> {
  const { roomId, issueId, consensusLabel, votingScale } = args;

  // Idempotency: delete any existing snapshots for this issue.
  const existing = await ctx.db
    .query("individualVotes")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .collect();
  await Promise.all(existing.map((row) => ctx.db.delete(row._id)));

  const votes = await Votes.getRoomVotes(ctx, roomId);

  // Build scale index map for deltaSteps computation.
  const scaleCards = votingScale?.cards ?? [];
  const numericScale = votingScale?.isNumeric ?? false;
  const scaleIndexMap = new Map<string, number>();
  scaleCards.forEach((card, idx) => {
    if (!SPECIAL_CARDS.includes(card)) {
      scaleIndexMap.set(card, idx);
    }
  });

  const consensusIndex = consensusLabel
    ? scaleIndexMap.get(consensusLabel)
    : undefined;
  const consensusValue =
    consensusLabel !== null ? parseFloat(consensusLabel) : undefined;

  const now = Date.now();

  await Promise.all(
    votes
      .filter((vote) => vote.cardLabel && !SPECIAL_CARDS.includes(vote.cardLabel))
      .map((vote) => {
        const label = vote.cardLabel!;
        const voteIndex = scaleIndexMap.get(label);
        const deltaSteps =
          numericScale && voteIndex !== undefined && consensusIndex !== undefined
            ? voteIndex - consensusIndex
            : undefined;

        const cardValue = parseFloat(label);

        return ctx.db.insert("individualVotes", {
          roomId,
          issueId,
          userId: vote.userId,
          cardLabel: label,
          cardValue: isNaN(cardValue) ? undefined : cardValue,
          consensusLabel: consensusLabel ?? undefined,
          consensusValue:
            consensusValue !== undefined && !isNaN(consensusValue)
              ? consensusValue
              : undefined,
          deltaSteps,
          votedAt: now,
        });
      })
  );
}

/** Schedules the Jira estimate push when the issue is Jira-linked and auto-push is enabled. */
async function scheduleJiraPushIfEnabled(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  issueId: Id<"issues">,
  finalEstimate: string
): Promise<void> {
  const issueLink = await ctx.db
    .query("issueLinks")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .first();
  if (issueLink?.provider !== "jira") return;

  const mapping = await ctx.db
    .query("integrationMappings")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .first();
  if (!mapping?.autoPushEstimates) return;

  await ctx.scheduler.runAfter(0, internal.integrations.jira.pushEstimateToJira, {
    issueId,
    finalEstimate,
  });
}

/**
 * abandon — drop the issue target, falling back to a target-less Quick Vote
 * (still in `voting`). Reverts the issue to `pending`, cancels the countdown as
 * one unit, and clears prior votes so the Quick Vote starts clean. A no-op-ish
 * transition on a room that is already a Quick Vote (no target to drop).
 */
export async function abandon(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get(roomId);
  if (!room) throw new Error("Room not found");

  // Revert the issue target (if any) to pending, closing its open round.
  if (room.currentIssueId) {
    const issue = await ctx.db.get(room.currentIssueId);
    if (issue && issue.status === "voting") {
      await Issues.closeOpenTimestamp(ctx, room.currentIssueId);
      await ctx.db.patch(room.currentIssueId, { status: "pending" });
    }
  }

  // Cancel the auto-reveal countdown as one unit (fields + scheduled reveal).
  await Countdown.cancel(ctx, roomId);

  // Fall back to a target-less Quick Vote, still in `voting`.
  await ctx.db.patch(roomId, {
    currentIssueId: undefined,
    isGameOver: false,
    lastActivityAt: Date.now(),
  });

  // Clear prior votes so the Quick Vote starts clean.
  await clearRoomVotes(ctx, roomId);
}

/**
 * cancelCountdown — manually stop an active auto-reveal countdown (story 13),
 * returning the round from `counting down` to `voting`. A facilitator action;
 * delegates to the one countdown seam so the teardown stays consistent.
 */
export async function cancelCountdown(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<void> {
  await Countdown.cancel(ctx, roomId);
}

// --- internal round helpers ---------------------------------------------

/** Deletes every vote in the room (start / reset / abandon clear prior votes). */
async function clearRoomVotes(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const votes = await ctx.db
    .query("votes")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  await Promise.all(votes.map((vote) => ctx.db.delete(vote._id)));
}

/**
 * Whether this round is timed and recorded. Quick Vote (no issue) rounds are
 * not, and the demo room is exempted to avoid unbounded growth — the previously
 * scattered `isDemoRoom` checks collapse to this one decision.
 */
function shouldRecordTiming(
  room: { isDemoRoom?: boolean },
  issueId?: Id<"issues">
): boolean {
  return !!issueId && !room.isDemoRoom;
}

/** Opens a fresh timed round for an issue, numbering it after prior rounds. */
async function openTimingRecord(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  issueId: Id<"issues">
): Promise<void> {
  const existing = await ctx.db
    .query("votingTimestamps")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .collect();
  await ctx.db.insert("votingTimestamps", {
    roomId,
    issueId,
    votingStartedAt: Date.now(),
    roundNumber: existing.length + 1,
  });
}

/**
 * The round's phase, derived (never stored) from existing room fields — see
 * ADR-0002. There is no `idle`: a target-less, unrevealed room is an active
 * Quick Vote in `voting`, indistinguishable from a fresh one.
 */
export type Phase = "voting" | "counting down" | "revealed";

/**
 * phaseOf — the round's phase as one derived read, so callers branch on a
 * single phase instead of re-deriving it from the raw `isGameOver` / countdown
 * fields. The demo cron drives off it today; it can back a `phase` field on the
 * room query whenever a client needs one.
 */
export function phaseOf(room: {
  isGameOver: boolean;
  autoRevealCountdownStartedAt?: number;
}): Phase {
  if (room.isGameOver) return "revealed";
  if (room.autoRevealCountdownStartedAt) return "counting down";
  return "voting";
}

export interface CastVoteArgs {
  roomId: Id<"rooms">;
  userId: Id<"users">;
  cardLabel: string;
  cardValue: number;
  cardIcon?: string;
}

/**
 * castVote — record (or change) a participant's card. A participant action, not
 * a transition; it asks the Countdown seam to re-evaluate, which arms the
 * auto-reveal countdown once every non-spectator has voted.
 */
export async function castVote(ctx: MutationCtx, args: CastVoteArgs): Promise<void> {
  await Rooms.updateRoomActivity(ctx, args.roomId);

  const existing = await ctx.db
    .query("votes")
    .withIndex("by_room_user", (q) =>
      q.eq("roomId", args.roomId).eq("userId", args.userId)
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      cardLabel: args.cardLabel,
      cardValue: args.cardValue,
      cardIcon: args.cardIcon,
    });
  } else {
    await ctx.db.insert("votes", {
      roomId: args.roomId,
      userId: args.userId,
      cardLabel: args.cardLabel,
      cardValue: args.cardValue,
      cardIcon: args.cardIcon,
    });
  }

  await Countdown.evaluate(ctx, args.roomId);
}

/**
 * retractVote — remove a participant's card. Re-evaluates the Countdown seam,
 * which cancels the countdown when the room is no longer fully voted.
 */
export async function retractVote(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; userId: Id<"users"> }
): Promise<void> {
  await Rooms.updateRoomActivity(ctx, args.roomId);

  const vote = await ctx.db
    .query("votes")
    .withIndex("by_room_user", (q) =>
      q.eq("roomId", args.roomId).eq("userId", args.userId)
    )
    .first();

  if (vote) {
    await ctx.db.delete(vote._id);
    await Countdown.evaluate(ctx, args.roomId);
  }
}

/**
 * The scheduled auto-reveal body. Reveals ONLY while `token` is still the
 * room's live countdown — a stale or un-cancelled job (its countdown since
 * cleared or replaced) is inert. Also no-ops when already revealed, when no
 * countdown is active, and when the room is gone.
 */
export async function autoReveal(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; token: number }
): Promise<void> {
  const room = await ctx.db.get(args.roomId);
  if (!room) return; // room gone
  if (room.isGameOver) return; // already revealed
  if (!room.autoRevealCountdownStartedAt) return; // no countdown active
  if (room.autoRevealCountdownStartedAt !== args.token) return; // stale token — inert

  await reveal(ctx, args.roomId);
}
