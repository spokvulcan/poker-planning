import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { DEFAULT_RETRO_PERMISSIONS } from "../permissions";
import { validateRoomName, updateRoomActivity } from "./rooms";
import { deleteRoomAggregateChunk } from "./roomAggregate";
import { listTeamsForUser } from "./teams";
import {
  currentStageOf,
  findFormat,
  seedStages,
  stampFormat,
  type StageEntry,
  type StageKind,
  type Visibility,
  type StampedFormat,
} from "./retroFormats";
import {
  ALREADY_KEPT_BY_TEAM,
  NO_TEAM_GROUP,
  NOT_A_RETRO,
  ONLY_OWNER_CAN_ADOPT,
  NOT_CURRENT_STAGE,
  STAGE_ENTRY_NOT_FOUND,
  TIMEBOX_INVALID,
  UNKNOWN_FORMAT,
} from "../retroCopy";
import { refusal } from "./refusal";

/**
 * The retro (ADR-0016): one room with its ceremony state in a `retros` row
 * beside it. This module holds creation, the board read, the Team's side of
 * a retro's life (adoption, claim, deletion) and the two listings; cards,
 * clusters, dots and the walk arrive with their own tickets.
 */

export interface CreateRetroArgs {
  name: string;
  ownerId: Id<"users">;
  /** A library format's name; the edited-copy seam is #290's. */
  formatName: string;
  /** Advisory cards-due date (ADR-0020). */
  collectUntil?: number;
  /**
   * The Team that keeps the retro, already guarded (the caller ran
   * `requireTeamRole`). Its retro defaults are copied by value (ADR-0013).
   */
  team?: Doc<"teams">;
}

/**
 * Creates a retro: the room (`roomType: "retro"`, always owned, the join
 * policy and permissions from the Team's defaults or the teamless values,
 * `retained` iff a Team keeps it) and the `retros` row (the attribution from
 * the same defaults, the format copied whole, the stamped stage list with
 * the first entry current) in one mutation, then the creator's owner
 * membership. Its own function rather than a branch of `Rooms.createRoom`,
 * which hard-codes the canvas type and seeds canvas nodes a retro never has.
 */
export async function createRetro(
  ctx: MutationCtx,
  args: CreateRetroArgs
): Promise<Id<"rooms">> {
  const format = findFormat(args.formatName);
  if (!format) {
    throw refusal("missing", UNKNOWN_FORMAT);
  }
  const name = validateRoomName(args.name);
  const now = Date.now();
  // Copied by value, whole (ADR-0008): the room's stored values are
  // authoritative from here on, whatever the Team's defaults become.
  const defaults = args.team?.retroDefaults;

  const roomId = await ctx.db.insert("rooms", {
    name,
    roomType: "retro",
    autoCompleteVoting: false,
    isGameOver: false,
    createdAt: now,
    lastActivityAt: now,
    retained: args.team !== undefined,
    ownerId: args.ownerId,
    ...(args.team ? { teamId: args.team._id } : {}),
    joinPolicy: defaults?.joinPolicy ?? "anyone",
    permissions: { ...(defaults?.permissions ?? DEFAULT_RETRO_PERMISSIONS) },
  });

  const stages = seedStages(format, { hasTeam: args.team !== undefined });
  await ctx.db.insert("retros", {
    roomId,
    attribution: defaults?.attribution ?? "named",
    format: stampFormat(format),
    stages,
    currentStageId: stages[0].id,
    currentStageEnteredAt: now,
    ...(args.collectUntil !== undefined ? { collectUntil: args.collectUntil } : {}),
  });

  await ctx.db.insert("roomMemberships", {
    roomId,
    userId: args.ownerId,
    isSpectator: false,
    role: "owner",
    joinedAt: now,
  });

  return roomId;
}

/** The retros row of a room, or null for a poker room. */
async function getRetro(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Doc<"retros"> | null> {
  return ctx.db
    .query("retros")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .unique();
}

/**
 * The board's structure read (spec §9): the `retros` row. Identity-free, so
 * every viewer shares one cached result. Cards and clusters join it with
 * the cards ticket.
 */
export async function getBoard(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Doc<"retros">> {
  return requireRetro(ctx, roomId);
}

/** The retros row of a room, or a `missing` refusal for a poker room. */
async function requireRetro(ctx: QueryCtx, roomId: Id<"rooms">): Promise<Doc<"retros">> {
  const retro = await getRetro(ctx, roomId);
  if (!retro) {
    throw refusal("missing", NOT_A_RETRO);
  }
  return retro;
}

// --- Stages (ADR-0010, spec §7) ---

/**
 * Advance: the shared pointer moves to any entry, forward or back, and the
 * entered-at instant is re-stamped so the advisory timebox counts from it.
 * It destroys, finalises and hides nothing beyond the read-time projection;
 * there is no stage guard and nothing advances itself. The walk snapshot on
 * entering a `discuss` entry (spec §12.1) joins with the walk ticket.
 */
export async function advance(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; toStageId: string }
): Promise<void> {
  const retro = await requireRetro(ctx, args.roomId);
  if (!retro.stages.some((stage) => stage.id === args.toStageId)) {
    throw refusal("missing", STAGE_ENTRY_NOT_FOUND);
  }
  await ctx.db.patch(retro._id, {
    currentStageId: args.toStageId,
    currentStageEnteredAt: Date.now(),
  });
  await updateRoomActivity(ctx, args.roomId);
}

/**
 * Patch one entry of the stage list in place; the act on the current entry
 * that the two in-the-moment `stageFlow` mutations share. Refused with
 * `stage` when the id is not the shared pointer's: an act on another entry
 * is a structural edit and belongs to `retroSettings` (spec §23.1).
 */
async function patchCurrentStage(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; stageId: string },
  patch: (entry: StageEntry) => StageEntry
): Promise<void> {
  const retro = await requireRetro(ctx, args.roomId);
  if (args.stageId !== retro.currentStageId) {
    throw refusal("stage", NOT_CURRENT_STAGE);
  }
  await ctx.db.patch(retro._id, {
    stages: retro.stages.map((entry) => (entry.id === args.stageId ? patch(entry) : entry)),
  });
  await updateRoomActivity(ctx, args.roomId);
}

/**
 * The in-place reveal toggle (ADR-0015): flips the current entry's reveal
 * policy either way, covering "show the board without moving on" and "hide
 * it again". A `stageFlow` act; the projection follows on the next read.
 */
export async function setCardsVisible(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; stageId: string; value: Visibility }
): Promise<void> {
  await patchCurrentStage(ctx, args, (entry) => ({ ...entry, cardsVisible: args.value }));
}

/**
 * The advisory timebox on the current entry (ADR-0010): whole minutes, or
 * none. The pill counts it down; at zero it says so and nothing else
 * happens. A `stageFlow` act.
 */
export async function setTimebox(
  ctx: MutationCtx,
  args: { roomId: Id<"rooms">; stageId: string; minutes?: number }
): Promise<void> {
  const { minutes } = args;
  if (minutes !== undefined && (!Number.isInteger(minutes) || minutes <= 0)) {
    throw refusal("forbidden", TIMEBOX_INVALID);
  }
  await patchCurrentStage(ctx, args, (entry) => {
    const { timeboxMinutes: _dropped, ...rest } = entry;
    return minutes === undefined ? rest : { ...rest, timeboxMinutes: minutes };
  });
}

/**
 * Adoption (spec §5, ADR-0019): the room owner gives a teamless retro to a
 * Team they belong to. Sets the set-once `teamId`, flips `retained`, and
 * stamps `teamId` onto the room's existing action items so they reach the
 * team page. Nothing else is rewritten — not the stage list (no `review`
 * comes back), not the join policy, attribution or permissions.
 *
 * The caller has already guarded attendance (`requireRoomMember`) and Team
 * membership (`requireTeamRole`); the ownership rule is an identity rule and
 * lives here, after the guards, like `transferOwnership`'s.
 */
export async function adoptIntoTeam(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actorUserId: Id<"users">; teamId: Id<"teams"> }
): Promise<void> {
  const { room } = args;
  if (room.roomType !== "retro") {
    throw refusal("missing", NOT_A_RETRO);
  }
  if (room.ownerId !== args.actorUserId) {
    throw refusal("forbidden", ONLY_OWNER_CAN_ADOPT);
  }
  if (room.teamId !== undefined) {
    throw refusal("forbidden", ALREADY_KEPT_BY_TEAM);
  }

  await ctx.db.patch(room._id, { teamId: args.teamId, retained: true });

  // A retro's action items are a handful (ADR-0017: one home each), so one
  // indexed read stamps them all inside the adoption transaction.
  const actions = await ctx.db
    .query("retroActions")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  await Promise.all(actions.map((action) => ctx.db.patch(action._id, { teamId: args.teamId })));

  await updateRoomActivity(ctx, room._id);
}

/**
 * `claim` (ADR-0013): the guard has already decided the actor may (a team
 * admin, attending, the owner absent or out of the Team). The actor becomes
 * `ownerId` and their membership `owner`; the previous owner's membership,
 * if present, becomes `participant`, keeping exactly one owner-role
 * membership in the room (ADR-0001).
 */
export async function claim(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actorMembership: Doc<"roomMemberships"> }
): Promise<void> {
  const { room, actorMembership } = args;
  if (room.roomType !== "retro") {
    throw refusal("missing", NOT_A_RETRO);
  }
  if (room.ownerId && room.ownerId !== actorMembership.userId) {
    const previous = await ctx.db
      .query("roomMemberships")
      .withIndex("by_room_user", (q) => q.eq("roomId", room._id).eq("userId", room.ownerId!))
      .unique();
    if (previous) {
      await ctx.db.patch(previous._id, { role: "participant" });
    }
  }
  await ctx.db.patch(actorMembership._id, { role: "owner" });
  await ctx.db.patch(room._id, { ownerId: actorMembership.userId });
  await updateRoomActivity(ctx, room._id);
}

/**
 * `delete` (ADR-0019): hard delete through the room cascade. The first
 * bounded step runs inside this mutation, so a retro of ordinary size is
 * gone when the call returns; a continuation is scheduled only when a full
 * batch remains.
 */
export async function deleteRetro(
  ctx: MutationCtx,
  room: Doc<"rooms">
): Promise<void> {
  // The retro API deletes retros; a poker room has no delete verb yet and
  // must not gain one through this door.
  if (room.roomType !== "retro") {
    throw refusal("missing", NOT_A_RETRO);
  }
  const step = await deleteRoomAggregateChunk(ctx, room._id);
  if (!step.done) {
    await ctx.scheduler.runAfter(0, internal.maintenance.deleteRoomAggregateChunk, {
      roomId: room._id,
    });
  }
}

/**
 * The counts the delete confirmation names (spec §19), read from the card
 * and action tables. Bounded reads: the copy needs a number, and a retro
 * never approaches the bound.
 */
const MAX_COUNTED_ROWS = 1000;

export async function deleteCounts(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<{ cards: number; openActions: number }> {
  const [cards, actions] = await Promise.all([
    ctx.db
      .query("retroCards")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(MAX_COUNTED_ROWS),
    ctx.db
      .query("retroActions")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(MAX_COUNTED_ROWS),
  ]);
  return {
    cards: cards.length,
    openActions: actions.filter((action) => action.status === "open").length,
  };
}

/**
 * The create form's pre-selection (spec §6.1): the Team's newest retro's
 * format, edited or not, or null for a Team with no retros yet.
 */
export async function lastFormat(
  ctx: QueryCtx,
  teamId: Id<"teams">
): Promise<StampedFormat | null> {
  const newest = await ctx.db
    .query("rooms")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .order("desc")
    .first();
  if (!newest) return null;
  const retro = await getRetro(ctx, newest._id);
  return retro ? retro.format : null;
}

/** One listing row (spec §16.5): the minimal row until #299's history row. */
export interface RetroListRow {
  roomId: Id<"rooms">;
  name: string;
  /** The resting stage's kind: the shared pointer. */
  stageKind: StageKind;
  collectUntil?: number;
  createdAt: number;
}

function toRow(room: Doc<"rooms">, retro: Doc<"retros">): RetroListRow {
  const current = currentStageOf(retro);
  return {
    roomId: room._id,
    name: room.name,
    stageKind: current.kind,
    ...(retro.collectUntil !== undefined ? { collectUntil: retro.collectUntil } : {}),
    createdAt: room.createdAt,
  };
}

/** Rows for the retro rooms among `rooms`, in the order given; poker rooms drop out. */
async function rowsOf(ctx: QueryCtx, rooms: Doc<"rooms">[]): Promise<RetroListRow[]> {
  const retros = await Promise.all(rooms.map((room) => getRetro(ctx, room._id)));
  return rooms.flatMap((room, i) => {
    const retro = retros[i];
    return retro ? [toRow(room, retro)] : [];
  });
}

/** How many of a Team's retros a listing shows; the history row (#299) pages. */
const MAX_LISTED_ROOMS = 200;

/** How many memberships the dashboard walks looking for retros. */
const MAX_SCANNED_MEMBERSHIPS = 1000;

/**
 * The team page's listing (spec §5): the Team's retros in creation order.
 * The bound keeps the newest, so a long history drops its oldest rows.
 */
export async function listForTeam(
  ctx: QueryCtx,
  teamId: Id<"teams">
): Promise<RetroListRow[]> {
  const rooms = await ctx.db
    .query("rooms")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .order("desc")
    .take(MAX_LISTED_ROOMS);
  return rowsOf(ctx, rooms.reverse());
}

/**
 * The dashboard's ordering (spec §16.5): retros whose shared stage is
 * `collect` first, newest first within each half.
 */
export function orderForDashboard(rows: RetroListRow[]): RetroListRow[] {
  return [...rows].sort((a, b) => {
    const aCollect = a.stageKind === "collect" ? 0 : 1;
    const bCollect = b.stageKind === "collect" ? 0 : 1;
    return aCollect - bCollect || b.createdAt - a.createdAt;
  });
}

export interface RetroListGroup {
  /** The door to the team page; only when the person is still a member. */
  teamId?: Id<"teams">;
  teamName: string;
  retros: RetroListRow[];
}

/**
 * `/dashboard/retros` (spec §18.1): the retros the person attended, grouped
 * by Team in the order they joined their Teams, teamless ones last under
 * "No team", `collect` first within each group. A group with no retros is
 * left out; the person's Teams have their own list beside this one.
 */
export async function listMine(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<RetroListGroup[]> {
  // Walk the person's memberships newest first and keep the retro rooms
  // among them, up to the listing bound: poker memberships share the index
  // and must not use up the budget before a retro is reached. The scan has
  // its own bound so a heavy poker player's dashboard degrades to "not
  // every retro" rather than to a read-limit failure.
  const rooms: Doc<"rooms">[] = [];
  let scanned = 0;
  for await (const membership of ctx.db
    .query("roomMemberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")) {
    const room = await ctx.db.get(membership.roomId);
    if (room?.roomType === "retro") rooms.push(room);
    if (rooms.length >= MAX_LISTED_ROOMS || ++scanned >= MAX_SCANNED_MEMBERSHIPS) break;
  }
  const rows = await rowsOf(ctx, rooms);
  const roomById = new Map(rooms.map((room) => [room._id, room]));

  const byTeam = new Map<Id<"teams"> | undefined, RetroListRow[]>();
  for (const row of rows) {
    const teamId = roomById.get(row.roomId)?.teamId;
    byTeam.set(teamId, [...(byTeam.get(teamId) ?? []), row]);
  }

  const groups: RetroListGroup[] = [];
  for (const team of await listTeamsForUser(ctx, userId)) {
    const retros = byTeam.get(team._id);
    if (retros) {
      groups.push({ teamId: team._id, teamName: team.name, retros: orderForDashboard(retros) });
      byTeam.delete(team._id);
    }
  }
  // Retros of a Team the person has since left are still theirs by
  // attendance: they list under the Team's name, without the door to a
  // team page they can no longer open. A Team mid-cascade lists its rooms
  // under "No team" until the cascade takes them.
  const teamless = byTeam.get(undefined) ?? [];
  for (const [teamId, retros] of byTeam) {
    if (teamId === undefined) continue;
    const team = await ctx.db.get(teamId);
    if (team) {
      groups.push({ teamName: team.name, retros: orderForDashboard(retros) });
    } else {
      teamless.push(...retros);
    }
  }
  if (teamless.length > 0) {
    groups.push({ teamName: NO_TEAM_GROUP, retros: orderForDashboard(teamless) });
  }
  return groups;
}
