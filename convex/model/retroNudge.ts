import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { currentStageOf } from "./retroFormats";
import { getRetro, MAX_BOARD_ROWS, requireRetro } from "./retro";
import { updateRoomActivity } from "./rooms";
import { refusal } from "./refusal";
import {
  FORMER_MEMBER,
  NUDGE_NEEDS_TEAM,
  NUDGE_ONLY_IN_COLLECT,
  NUDGE_TOO_SOON,
} from "../retroCopy";

/**
 * The nudge (ADR-0020, spec §16.2): the human-sent email about an open
 * collection window. A mutation here records intent (`retros.lastNudge`)
 * and schedules `internal.email.send`; the action resolves recipients at
 * send time through `resolveRetroSend`, so a person who opted out, left
 * the Team or deleted their account between click and delivery is never
 * emailed. Nothing here is ever scheduled by a date.
 */

/** At most one nudge per retro per 24 hours, server-enforced. */
export const NUDGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How many Team members one send addresses; a Team never approaches it. */
const MAX_TEAM_RECIPIENTS = 500;

export type RetroEmailKind = "retroOpen" | "nudge";

/**
 * Press the button: `stageFlow` is the caller's guard; the Team, the stage
 * and the day are the rules here. Writes `lastNudge`, schedules the send,
 * bumps activity (spec §14).
 */
export async function nudge(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actorId: Id<"users"> }
): Promise<void> {
  const retro = await requireRetro(ctx, args.room._id);
  if (args.room.teamId === undefined) {
    throw refusal("forbidden", NUDGE_NEEDS_TEAM);
  }
  if (currentStageOf(retro).kind !== "collect") {
    throw refusal("stage", NUDGE_ONLY_IN_COLLECT);
  }
  if (retro.lastNudge !== undefined && Date.now() - retro.lastNudge.at < NUDGE_WINDOW_MS) {
    throw refusal("budget", NUDGE_TOO_SOON);
  }
  await recordAndSchedule(ctx, retro, args.actorId, "nudge");
  await updateRoomActivity(ctx, args.room);
}

/**
 * The "it's open" email from the create form (spec §6.1, §16.2): once, to
 * every Team member except the creator. A nudge for rate purposes, so it
 * sets `lastNudge`. Creation already stamped a live clock, so no bump.
 */
export async function emailTeamOpen(
  ctx: MutationCtx,
  args: { retro: Doc<"retros">; creatorId: Id<"users"> }
): Promise<void> {
  await recordAndSchedule(ctx, args.retro, args.creatorId, "retroOpen");
}

async function recordAndSchedule(
  ctx: MutationCtx,
  retro: Doc<"retros">,
  senderId: Id<"users">,
  kind: RetroEmailKind
): Promise<void> {
  await ctx.db.patch(retro._id, { lastNudge: { at: Date.now(), by: senderId } });
  await ctx.scheduler.runAfter(0, internal.email.send, { kind, roomId: retro.roomId, senderId });
}

/**
 * The audience (spec §16.2): the Team's members except the sender, and in
 * a named retro only those with no card in this retro (`by_room_author`).
 * Team members who never joined the room are included; that is the point.
 * Removed members are excluded by construction (no `teamMemberships` row).
 * The "it's open" email skips the card filter: nobody has written yet, and
 * the creator asked for everyone.
 */
export async function recipientsOf(
  ctx: QueryCtx,
  args: { teamId: Id<"teams">; retro: Doc<"retros">; senderId: Id<"users">; kind: RetroEmailKind }
): Promise<Id<"users">[]> {
  const memberships = await ctx.db
    .query("teamMemberships")
    .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
    .take(MAX_TEAM_RECIPIENTS);
  const candidates = memberships.map((m) => m.userId).filter((id) => id !== args.senderId);
  if (args.kind === "retroOpen" || args.retro.attribution !== "named") {
    return candidates;
  }
  const written = await Promise.all(
    candidates.map((userId) =>
      ctx.db
        .query("retroCards")
        .withIndex("by_room_author", (q) => q.eq("roomId", args.retro.roomId).eq("authorId", userId))
        .first()
    )
  );
  return candidates.filter((_, i) => written[i] === null);
}

/** What the nudge button reads (spec §16.2), for a viewer on a team retro. */
export interface NudgeStatus {
  /** How many the button would email now, from the viewer's seat. */
  recipientCount: number;
  /** The last send, for "Sent {ago} by {name}"; null before the first. */
  lastNudge: { at: number; byName: string } | null;
}

/** Null for a teamless retro, which has no nudge. */
export async function nudgeStatus(
  ctx: QueryCtx,
  args: { room: Doc<"rooms">; viewerId: Id<"users"> }
): Promise<NudgeStatus | null> {
  if (args.room.teamId === undefined) return null;
  const retro = await requireRetro(ctx, args.room._id);
  const recipients = await recipientsOf(ctx, {
    teamId: args.room.teamId,
    retro,
    senderId: args.viewerId,
    kind: "nudge",
  });
  let lastNudge: NudgeStatus["lastNudge"] = null;
  if (retro.lastNudge) {
    const by = await ctx.db.get(retro.lastNudge.by);
    lastNudge = { at: retro.lastNudge.at, byName: by?.name ?? FORMER_MEMBER };
  }
  return { recipientCount: recipients.length, lastNudge };
}

/** One addressable recipient, resolved at send time. */
export interface EmailRecipient {
  userId: Id<"users">;
  email: string;
}

/** What a retro email says (spec §16.2): never card text, never a non-writer's name, never a per-person count. */
export interface RetroEmailContent {
  kind: RetroEmailKind;
  roomId: Id<"rooms">;
  retroName: string;
  teamName: string;
  formatName: string;
  cardCount: number;
  collectUntil?: number;
  senderName: string;
  /** Reply-to, so a reply reaches a human; absent when the sender has no address. */
  senderEmail?: string;
}

export interface ResolvedRetroSend {
  content: RetroEmailContent;
  recipients: EmailRecipient[];
}

/**
 * Send-time resolution (spec §16.1): the audience recomputed now, then
 * narrowed to accounts that still exist, carry an address and have not
 * opted out. Null when there is nothing to send: the room or its Team is
 * gone, or the retro is not a team retro (a teamless retro never emails
 * anyone). A read only; the send action never patches the room.
 */
export async function resolveRetroSend(
  ctx: QueryCtx,
  args: { kind: RetroEmailKind; roomId: Id<"rooms">; senderId: Id<"users"> }
): Promise<ResolvedRetroSend | null> {
  const room = await ctx.db.get(args.roomId);
  if (!room || room.teamId === undefined) return null;
  const [retro, team, sender] = await Promise.all([
    getRetro(ctx, room._id),
    ctx.db.get(room.teamId),
    ctx.db.get(args.senderId),
  ]);
  if (!retro || !team) return null;
  const userIds = await recipientsOf(ctx, {
    teamId: team._id,
    retro,
    senderId: args.senderId,
    kind: args.kind,
  });
  const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
  const recipients: EmailRecipient[] = [];
  for (const user of users) {
    if (!user || user.email === undefined || user.emailOptOut === true) continue;
    recipients.push({ userId: user._id, email: user.email });
  }
  const cards = await ctx.db
    .query("retroCards")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .take(MAX_BOARD_ROWS);
  return {
    content: {
      kind: args.kind,
      roomId: room._id,
      retroName: room.name,
      teamName: team.name,
      formatName: retro.format.name,
      cardCount: cards.length,
      ...(retro.collectUntil !== undefined ? { collectUntil: retro.collectUntil } : {}),
      senderName: sender?.name ?? FORMER_MEMBER,
      ...(sender?.email !== undefined ? { senderEmail: sender.email } : {}),
    },
    recipients,
  };
}
