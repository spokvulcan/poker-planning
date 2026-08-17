import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import * as Rooms from "./rooms";
import * as Canvas from "./canvas";
import * as Votes from "./votes";
import * as Analytics from "./analytics";
import { cardNumericValue, computeVoterAlignment } from "./alignment";
import { summarize, VoteStatsSummary } from "../summarize";
import { DEFAULT_SCALE, VotingScale } from "../scales";
import { COUNTDOWN_DURATION_MS } from "../constants";

/**
 * VotingRound — the module that owns the round's lifecycle (ADR-0002).
 * Sole writer of the round's state: the rooms round fields, the votes table,
 * and — while a round is running — the target issue's `status` and
 * `votingTimestamps` (the `completed` transition and the one canonical
 * timestamp-close path live here, not in the issues module). Owns the
 * transitions (start, reveal, reset, abandon) and the auto-reveal countdown.
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
      await closeOpenTimingRecord(ctx, room.currentIssueId);
      await ctx.db.patch(room.currentIssueId, { status: "pending" });
    }
  }

  // Mark the new issue target as voting (Quick Vote has no issue status).
  if (args.issueId) {
    await ctx.db.patch(args.issueId, { status: "voting" });
  }

  // Cancel any countdown left over from the previous round.
  await cancel(ctx, args.roomId);

  // Move to a fresh `voting` phase on the new target.
  await ctx.db.patch(args.roomId, {
    currentIssueId: args.issueId,
    isGameOver: false,
  });
  await Rooms.updateRoomActivity(ctx, args.roomId);

  await clearRoomVotes(ctx, args.roomId);

  if (shouldRecordTiming(args.issueId)) {
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
      if (issue.status === "voting" && shouldRecordTiming(room.currentIssueId)) {
        await closeOpenTimingRecord(ctx, room.currentIssueId);
      }
      await ctx.db.patch(room.currentIssueId, { status: "voting" });
      if (shouldRecordTiming(room.currentIssueId)) {
        await openTimingRecord(ctx, roomId, room.currentIssueId);
      }
    }
  }

  await cancel(ctx, roomId);
  await ctx.db.patch(roomId, { isGameOver: false });
  await Rooms.updateRoomActivity(ctx, roomId);
  await clearRoomVotes(ctx, roomId);
}

/**
 * reveal — settle the round: flip to `revealed`, cancel the countdown, and run
 * the reveal effects. For an issue-backed round it snapshots the summary onto
 * the issue (final estimate + stats), records per-voter alignment, closes the
 * timed round, schedules the Jira push when linked with auto-push, and upserts
 * the canvas results node. A round that completes its target issue (consensus
 * reached) also refreshes the room's analytics snapshot in the same mutation.
 */
export async function reveal(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get(roomId);
  if (!room) throw new Error("Room not found");

  // Cancel the countdown as one unit, then settle to `revealed`.
  await cancel(ctx, roomId);
  await ctx.db.patch(roomId, { isGameOver: true });
  await Rooms.updateRoomActivity(ctx, roomId);

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
      await completeTargetIssue(ctx, {
        issueId: room.currentIssueId,
        finalEstimate: summary.consensus,
        voteStats: summary.stats,
      });
    } else if (shouldRecordTiming(room.currentIssueId)) {
      // No consensus to snapshot (all special / no votes), so the issue stays
      // un-completed — but the round is over. Close its open timing record now
      // so the duration ends at reveal, not at the next reset/abandon.
      await closeOpenTimingRecord(ctx, room.currentIssueId);
    }

    // Per-voter alignment snapshot for analytics/export.
    await snapshotVoterAlignment(ctx, {
      roomId,
      issueId: room.currentIssueId,
      consensusLabel: summary.consensus,
      votingScale: room.votingScale,
    });

    // A completed target issue changes the room's completed-issue history:
    // refresh the analytics snapshot in the same mutation. This must run after
    // the issue patch (completeTargetIssue) and the vote snapshot above so the
    // refreshed history includes this round's issue and votes.
    if (summary.consensus) {
      await Analytics.refreshRoomAnalyticsSnapshot(ctx, roomId);
    }

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
 * The per-voter computation itself is pure (`alignment.ts`); this is the IO.
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
  const rows = computeVoterAlignment(votes, consensusLabel, votingScale);

  const now = Date.now();
  await Promise.all(
    rows.map((row) =>
      ctx.db.insert("individualVotes", {
        roomId,
        issueId,
        ...row,
        votedAt: now,
      })
    )
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
      await closeOpenTimingRecord(ctx, room.currentIssueId);
      await ctx.db.patch(room.currentIssueId, { status: "pending" });
    }
  }

  // Cancel the auto-reveal countdown as one unit (fields + scheduled reveal).
  await cancel(ctx, roomId);

  // Fall back to a target-less Quick Vote, still in `voting`.
  await ctx.db.patch(roomId, {
    currentIssueId: undefined,
    isGameOver: false,
  });
  await Rooms.updateRoomActivity(ctx, roomId);

  // Clear prior votes so the Quick Vote starts clean.
  await clearRoomVotes(ctx, roomId);
}

/**
 * cancelCountdown — manually stop an active auto-reveal countdown,
 * returning the round from `countingDown` to `voting`. A facilitator action.
 */
export async function cancelCountdown(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<void> {
  await Rooms.updateRoomActivity(ctx, roomId);
  await cancel(ctx, roomId);
}

/**
 * setAutoComplete — flip the room's auto-complete setting and reconcile the
 * countdown in the same step, so the setting can't drift from the countdown it
 * feeds (the "remember to reconcile" class ADR-0004 closed for roster exits).
 * Disabling tears the countdown down as one unit; enabling re-evaluates so a
 * fully-voted room arms immediately instead of waiting for the next vote.
 */
export async function setAutoComplete(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  enabled: boolean
): Promise<void> {
  await Rooms.updateRoomActivity(ctx, roomId);
  if (!enabled) {
    await cancel(ctx, roomId);
    await ctx.db.patch(roomId, { autoCompleteVoting: false });
    return;
  }
  await ctx.db.patch(roomId, { autoCompleteVoting: true });
  await evaluate(ctx, roomId);
}

// --- internal round helpers ---------------------------------------------

/**
 * arm — stamps the countdown token and schedules the auto-reveal. The token
 * is carried into the scheduled reveal so a stale job (countdown since cleared
 * or replaced) is inert even if cancel is missed. Idempotent: no-ops when a
 * countdown is already running.
 */
async function arm(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get(roomId);
  if (!room) throw new Error("Room not found");
  if (room.autoRevealCountdownStartedAt) return; // already counting down

  const token = Date.now();
  const scheduledId = await ctx.scheduler.runAfter(
    COUNTDOWN_DURATION_MS,
    internal.votingRound.autoReveal,
    { roomId, token }
  );
  await ctx.db.patch(roomId, {
    autoRevealCountdownStartedAt: token,
    autoRevealScheduledId: scheduledId,
  });
}

/**
 * cancel — tears down the countdown as one unit: cancels the scheduled
 * reveal and clears both room fields. Safe to call when no countdown is
 * active (no-ops on missing fields).
 */
async function cancel(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get(roomId);
  if (!room) return;

  if (room.autoRevealScheduledId) {
    try {
      await ctx.scheduler.cancel(room.autoRevealScheduledId);
    } catch {
      // Job may have already executed or been cancelled — that's fine.
    }
  }

  if (room.autoRevealCountdownStartedAt || room.autoRevealScheduledId) {
    await ctx.db.patch(roomId, {
      autoRevealCountdownStartedAt: undefined,
      autoRevealScheduledId: undefined,
    });
  }
}

/**
 * evaluate — re-checks the all-voted predicate and arms or cancels the
 * auto-reveal countdown accordingly. The entry point for every vote-change
 * and roster-shrink path so the countdown stays in sync.
 */
async function evaluate(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const room = await ctx.db.get(roomId);
  if (!room) return;
  if (!room.autoCompleteVoting || room.isGameOver) return;

  const allIn = await Votes.areAllVotesIn(ctx, roomId);
  if (allIn && !room.autoRevealCountdownStartedAt) {
    await arm(ctx, roomId);
  } else if (!allIn && room.autoRevealCountdownStartedAt) {
    await cancel(ctx, roomId);
  }
}

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
 * not; an issue-backed round always is. (The former demo-room exemption is gone
 * with the demo, which is now a client-only simulation — ADR-0003.)
 */
function shouldRecordTiming(issueId?: Id<"issues">): boolean {
  return !!issueId;
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
 * Closes the target issue's open timed round, if any — the ONE canonical
 * timestamp-close path. Every transition that ends a round without completing
 * it (start switching targets, reset, abandon, a consensus-less reveal)
 * funnels through here. Returns whether a round was open.
 */
async function closeOpenTimingRecord(
  ctx: MutationCtx,
  issueId: Id<"issues">
): Promise<boolean> {
  const timestamps = await ctx.db
    .query("votingTimestamps")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .collect();

  const latest = timestamps[timestamps.length - 1];
  if (!latest || latest.votingEndedAt) return false;

  const now = Date.now();
  await ctx.db.patch(latest._id, {
    votingEndedAt: now,
    durationMs: now - latest.votingStartedAt,
  });
  return true;
}

/**
 * completeTargetIssue — the `completed` transition of an issue-backed target:
 * sets the final estimate and stats snapshot, closes the open timed round via
 * the canonical path, and records time-to-consensus as the total across the
 * issue's rounds. The round module owns this lifecycle write (ADR-0002); the
 * issues module keeps CRUD only.
 */
async function completeTargetIssue(
  ctx: MutationCtx,
  args: {
    issueId: Id<"issues">;
    finalEstimate: string;
    voteStats: VoteStatsSummary;
  }
): Promise<void> {
  const now = Date.now();

  // Close the open timed round (canonical close), then total the time across
  // rounds. Always recorded for an issue-backed round (the former demo-room
  // exemption is gone with the demo — ADR-0003).
  const closedOpenRound = await closeOpenTimingRecord(ctx, args.issueId);

  const timestamps = await ctx.db
    .query("votingTimestamps")
    .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
    .collect();
  const totalMs = timestamps.reduce((sum, ts) => sum + (ts.durationMs ?? 0), 0);

  let timeToConsensusMs: number | undefined;
  if (closedOpenRound) {
    // The just-closed round's duration is in the total.
    timeToConsensusMs = totalMs;
  } else if (totalMs > 0) {
    // All rounds already closed (e.g. issue was reset then completed) — sum existing.
    timeToConsensusMs = totalMs;
  }

  await ctx.db.patch(args.issueId, {
    status: "completed",
    finalEstimate: args.finalEstimate,
    votedAt: now,
    voteStats: {
      average: args.voteStats.average ?? undefined,
      median: args.voteStats.median ?? undefined,
      agreement: args.voteStats.agreement,
      voteCount: args.voteStats.voteCount,
      timeToConsensusMs,
    },
  });
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
 * a transition; it calls the private evaluate helper, which arms the auto-reveal
 * countdown once every non-spectator has voted.
 */
export async function castVote(ctx: MutationCtx, args: CastVoteArgs): Promise<void> {
  // Spectators are voteless: the round refuses a spectator's ballot at its sole
  // write site rather than recording a vote that `areAllVotesIn` would ignore.
  // This keeps the votes table free of spectator rows, so a member admitted
  // mid-countdown (un-spectated, or joining) can never already hold a vote — the
  // premise that lets admission skip reconciliation (ADR-0004).
  const membership = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room_user", (q) =>
      q.eq("roomId", args.roomId).eq("userId", args.userId)
    )
    .first();
  if (membership?.isSpectator) {
    throw new Error("Spectators cannot vote");
  }

  // Validate the card against the room's voting scale and re-derive its numeric
  // value server-side. pickCard is public, so an unchecked label/value would
  // flow into vote stats, exports, and auto-pushed Jira estimates.
  const room = await ctx.db.get(args.roomId);
  if (!room) throw new Error("Room not found");
  const scale = room.votingScale ?? DEFAULT_SCALE;
  const scaleCards: readonly string[] = scale.cards;
  if (!scaleCards.includes(args.cardLabel)) {
    throw new Error("Card is not in this room's voting scale");
  }
  const cardValue = scale.isNumeric
    ? (cardNumericValue(args.cardLabel) ?? 0)
    : 0;

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
      cardValue,
      cardIcon: args.cardIcon,
    });
  } else {
    await ctx.db.insert("votes", {
      roomId: args.roomId,
      userId: args.userId,
      cardLabel: args.cardLabel,
      cardValue,
      cardIcon: args.cardIcon,
    });
  }

  await evaluate(ctx, args.roomId);
}

/**
 * retractVote — remove a participant's card. Re-evaluates the countdown state
 * via the private helper, cancelling the countdown when the room is no longer
 * fully voted.
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
    await evaluate(ctx, args.roomId);
  }
}

/**
 * dropVoter — a member stops counting toward the current round: they left the
 * room (or were removed), or switched to spectator. Deletes their votes — the
 * round is the sole writer of the votes table (ADR-0002) — and reconciles the
 * auto-reveal countdown. Because the non-spectator roster only shrinks here, the
 * re-evaluation can complete the round and ARM the countdown (it cancels only in
 * the degenerate case where the last voter is now gone). Never a phase transition.
 *
 * Call AFTER the caller has written the membership change (the spectator flip or
 * the membership delete), so `areAllVotesIn` reads the new roster. The inverse —
 * admitting a member mid-countdown — deliberately does NOT reconcile: a latecomer
 * never cancels a running countdown (ADR-0004).
 */
export async function dropVoter(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">
): Promise<void> {
  const votes = await ctx.db
    .query("votes")
    .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
    .collect();
  await Promise.all(votes.map((vote) => ctx.db.delete(vote._id)));

  await evaluate(ctx, roomId);
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
