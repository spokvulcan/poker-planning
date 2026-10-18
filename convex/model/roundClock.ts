import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import * as Rooms from "./rooms";
import { refusal } from "./refusal";
import { rulesOf } from "../ceremony";
import {
  AWAY_RECORD_MS,
  DEFAULT_TIMEBOX_MS,
  IDLE_MS,
  SESSION_GAP_MS,
  TIMEBOX_EXTENSION_MS,
  TIMEBOX_MAX_MS,
  TIMEBOX_MIN_MS,
  overlapsFrom,
  sessionItems,
  targetTime,
  type BreakKind,
  type RoundClockView,
  type RoundFact,
} from "../roundTime";

/**
 * RoundClock — a poker room's clock beyond the rounds themselves (CONTEXT.md:
 * Round clock, ADR-0032): who has the room open, the breaks, the session, the
 * pause and the timebox. The one writer of `roundClocks`, `roomAttendance` and
 * `roomBreaks`. The rounds are the voting round's (model/votingRound.ts),
 * which tells this module when a round moves on; this module only reads
 * them, for the clock query and an issue's time-to-consensus. It stores
 * facts and leaves what they mean to the reader (convex/roundTime.ts).
 */

/** How stale `lastSeenAt` may get before a heartbeat writes it: attendance is kept to the minute. */
const ATTENDANCE_RESOLUTION_MS = 60_000;

/** Most rounds and breaks the clock query reads: far more than a session holds. */
const MAX_SESSION_ROUNDS = 200;
const MAX_ISSUE_ROUNDS = 100;
const MAX_BREAKS = 500;

async function clockOfRoom(ctx: QueryCtx, roomId: Id<"rooms">): Promise<Doc<"roundClocks"> | null> {
  return await ctx.db
    .query("roundClocks")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .unique();
}

async function ensureClock(ctx: MutationCtx, roomId: Id<"rooms">): Promise<Doc<"roundClocks">> {
  const clock = await clockOfRoom(ctx, roomId);
  if (clock) return clock;
  const id = await ctx.db.insert("roundClocks", { roomId });
  return (await ctx.db.get("roundClocks", id))!;
}

async function addBreak(ctx: MutationCtx, roomId: Id<"rooms">, from: number, to: number, kind: BreakKind): Promise<void> {
  if (to > from) await ctx.db.insert("roomBreaks", { roomId, from, to, kind });
}

/** A poker room has a round clock; a retro has none. */
function hasClock(room: Doc<"rooms">): boolean {
  return rulesOf(room).votingRounds;
}

// --- Facts ------------------------------------------------------------------------

/**
 * Someone has the room open (presence's heartbeat, every few seconds from
 * every open tab). Kept to the minute: a gap since the last heartbeat is a
 * stretch nobody was there, and a long one starts a new session, whose
 * leftover timebox goes with the old one.
 */
export async function noteAttendance(ctx: MutationCtx, room: Doc<"rooms">, now = Date.now()): Promise<void> {
  if (!hasClock(room)) return;
  const seen = await ctx.db
    .query("roomAttendance")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .unique();
  if (seen && now - seen.lastSeenAt < ATTENDANCE_RESOLUTION_MS) return;

  const gap = seen ? now - seen.lastSeenAt : Infinity;
  if (seen && gap >= AWAY_RECORD_MS) await addBreak(ctx, room._id, seen.lastSeenAt, now, "away");
  if (!seen) await forgetUntrackedPast(ctx, room._id, now);
  if (gap >= SESSION_GAP_MS) {
    const clock = await ensureClock(ctx, room._id);
    await ctx.db.patch("roundClocks", clock._id, { sessionStartedAt: now, timebox: undefined });
  }
  if (seen) await ctx.db.patch("roomAttendance", seen._id, { lastSeenAt: now });
  else await ctx.db.insert("roomAttendance", { roomId: room._id, lastSeenAt: now });
}

/**
 * A round left open since before the clock kept attendance: nobody can say
 * who was there, so a long-open one's past is left out as nobody's.
 */
async function forgetUntrackedPast(ctx: MutationCtx, roomId: Id<"rooms">, now: number): Promise<void> {
  const round = await ctx.db
    .query("votingTimestamps")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .order("desc")
    .first();
  if (round && round.endedAt === undefined && now - round.votingStartedAt >= SESSION_GAP_MS) {
    await addBreak(ctx, roomId, round.votingStartedAt, now, "away");
  }
}

/**
 * A person did something in the room (the activity chokepoint, before it
 * moves the room's clock): a quiet of IDLE_MS or more before it was a long
 * quiet, whose part past IDLE_MS the clock leaves out. One write can pass
 * through the chokepoint twice with the room it loaded, so the same quiet
 * is kept once.
 */
export async function noteActivity(ctx: MutationCtx, room: Doc<"rooms">, now = Date.now()): Promise<void> {
  if (!hasClock(room)) return;
  const from = room.lastActivityAt + IDLE_MS;
  if (now <= from) return;
  const last = await ctx.db
    .query("roomBreaks")
    .withIndex("by_room_to", (q) => q.eq("roomId", room._id))
    .order("desc")
    .first();
  if (last?.kind === "idle" && last.from === from) return;
  await addBreak(ctx, room._id, from, now, "idle");
}

// --- The pause --------------------------------------------------------------------

/** Someone called a break: the clock stops until it is lifted, or the round moves. */
export async function pause(ctx: MutationCtx, room: Doc<"rooms">, now = Date.now()): Promise<void> {
  const clock = await ensureClock(ctx, room._id);
  if (clock.pausedAt === undefined) await ctx.db.patch("roundClocks", clock._id, { pausedAt: now });
  await Rooms.updateRoomActivity(ctx, room);
}

/** The break is over: what it held becomes a break the clock leaves out. */
export async function resume(ctx: MutationCtx, room: Doc<"rooms">, now = Date.now()): Promise<void> {
  await liftPause(ctx, room._id, now);
  await Rooms.updateRoomActivity(ctx, room);
}

async function liftPause(ctx: MutationCtx, roomId: Id<"rooms">, now: number): Promise<void> {
  const clock = await clockOfRoom(ctx, roomId);
  if (clock?.pausedAt === undefined) return;
  await addBreak(ctx, roomId, clock.pausedAt, now, "pause");
  await ctx.db.patch("roundClocks", clock._id, { pausedAt: undefined });
}

// --- The timebox ------------------------------------------------------------------

/** Flips the sand timer for everyone: `durationMs` from now, remembered as the next flip's length. */
export async function startTimebox(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  durationMs: number,
  now = Date.now()
): Promise<void> {
  if (!Number.isFinite(durationMs) || durationMs < TIMEBOX_MIN_MS || durationMs > TIMEBOX_MAX_MS) {
    throw refusal("forbidden", "A timebox runs from 10 seconds to 30 minutes.");
  }
  const clock = await ensureClock(ctx, room._id);
  await ctx.db.patch("roundClocks", clock._id, { timebox: { startedAt: now, durationMs }, timeboxMs: durationMs });
  await Rooms.updateRoomActivity(ctx, room);
}

/** Adds a minute to the running timebox; one already over gets a minute from now. */
export async function extendTimebox(ctx: MutationCtx, room: Doc<"rooms">, now = Date.now()): Promise<void> {
  const clock = await clockOfRoom(ctx, room._id);
  if (!clock?.timebox) return;
  const { startedAt, durationMs } = clock.timebox;
  const extended = Math.min(Math.max(durationMs, now - startedAt) + TIMEBOX_EXTENSION_MS, now - startedAt + TIMEBOX_MAX_MS);
  await ctx.db.patch("roundClocks", clock._id, { timebox: { startedAt, durationMs: extended } });
  await Rooms.updateRoomActivity(ctx, room);
}

/** Puts the timebox away. */
export async function stopTimebox(ctx: MutationCtx, room: Doc<"rooms">): Promise<void> {
  const clock = await clockOfRoom(ctx, room._id);
  if (clock?.timebox) await ctx.db.patch("roundClocks", clock._id, { timebox: undefined });
  await Rooms.updateRoomActivity(ctx, room);
}

// --- The round moves --------------------------------------------------------------

/**
 * The room moved on to a new round (model/votingRound.ts: start, reset,
 * abandon): the timebox was for the discussion that just ended, and a pause
 * nobody lifted is over, since someone is clearly back.
 */
export async function roundMoved(ctx: MutationCtx, room: Doc<"rooms">, now = Date.now()): Promise<void> {
  if (!hasClock(room)) return;
  await liftPause(ctx, room._id, now);
  const clock = await clockOfRoom(ctx, room._id);
  if (clock?.timebox) await ctx.db.patch("roundClocks", clock._id, { timebox: undefined });
}

/** Someone voted or revealed: a pause nobody lifted is over. */
export async function roundActed(ctx: MutationCtx, room: Doc<"rooms">, now = Date.now()): Promise<void> {
  if (!hasClock(room)) return;
  await liftPause(ctx, room._id, now);
}

// --- The clock query --------------------------------------------------------------

function factOf(row: Doc<"votingTimestamps">): RoundFact {
  return {
    ...(row.issueId !== undefined && { issueId: row.issueId }),
    startedAt: row.votingStartedAt,
    ...(row.votingEndedAt !== undefined && { votingEndedAt: row.votingEndedAt }),
    ...(row.revealedAt !== undefined && { revealedAt: row.revealedAt }),
    ...(row.endedAt !== undefined && { endedAt: row.endedAt }),
  };
}

/**
 * The round clock of a room. Reads no room row, so the activity clock every
 * vote moves re-runs none of it; the current target is the latest round's.
 */
export async function clockOf(ctx: QueryCtx, roomId: Id<"rooms">): Promise<RoundClockView> {
  const [clock, recent] = await Promise.all([
    clockOfRoom(ctx, roomId),
    ctx.db
      .query("votingTimestamps")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("desc")
      .take(MAX_SESSION_ROUNDS),
  ]);
  const latest = recent[0];
  const current = !latest
    ? []
    : latest.issueId === undefined
      ? [latest]
      : await ctx.db
          .query("votingTimestamps")
          .withIndex("by_issue", (q) => q.eq("issueId", latest.issueId))
          .take(MAX_ISSUE_ROUNDS);

  const sessionStartedAt = clock?.sessionStartedAt ?? null;
  const sessionRounds = recent
    .map(factOf)
    .reverse()
    .filter((round) => sessionStartedAt === null || overlapsFrom(round, sessionStartedAt));
  const items = sessionItems(sessionRounds);
  const issueIds = [...new Set(items.flatMap((item) => (item.issueId ? [item.issueId] : [])))];
  const titles = new Map(
    (await Promise.all(issueIds.map((id) => ctx.db.get("issues", id)))).flatMap((issue) =>
      issue ? [[issue._id, issue.title] as const] : []
    )
  );

  const currentFacts = current.map(factOf);
  const since = Math.min(
    currentFacts[0]?.startedAt ?? Infinity,
    sessionStartedAt ?? sessionRounds[0]?.startedAt ?? Infinity
  );
  const breaks = Number.isFinite(since)
    ? await ctx.db
        .query("roomBreaks")
        .withIndex("by_room_to", (q) => q.eq("roomId", roomId).gt("to", since))
        .take(MAX_BREAKS)
    : [];

  return {
    sessionStartedAt,
    pausedAt: clock?.pausedAt ?? null,
    timebox: clock?.timebox ?? null,
    timeboxMs: clock?.timeboxMs ?? DEFAULT_TIMEBOX_MS,
    current: currentFacts,
    items: items.map((item) => {
      const title = item.issueId ? titles.get(item.issueId) : undefined;
      return { ...item, ...(title !== undefined && { title }) };
    }),
    breaks: breaks.map(({ from, to, kind }) => ({ from, to, kind })),
  };
}

// --- Time-to-consensus ------------------------------------------------------------

/**
 * An issue's time-to-consensus, at `now`, the reveal that settles it
 * (ADR-0034): the time its rounds took, voting and the discussion between
 * them, less the breaks the clock leaves out. That is what the timer showed
 * at that moment: by the reveal, a pause it lifted and a long quiet before it
 * are facts too. None when no round of the issue was timed.
 */
export async function timeToConsensus(ctx: QueryCtx, issueId: Id<"issues">, now: number): Promise<number | undefined> {
  const rounds = await ctx.db
    .query("votingTimestamps")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .take(MAX_ISSUE_ROUNDS);
  const first = rounds[0];
  if (!first) return undefined;
  const since = Math.min(...rounds.map((round) => round.votingStartedAt));
  const breaks = await ctx.db
    .query("roomBreaks")
    .withIndex("by_room_to", (q) => q.eq("roomId", first.roomId).gt("to", since))
    .take(MAX_BREAKS);
  return targetTime(
    rounds.map(factOf),
    breaks.map(({ from, to, kind }) => ({ from, to, kind })),
    now
  ).ms;
}
