import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import type { ResolvedDecision } from "../permissions";
import { resolveRoomAction } from "./auth";
import { updateRoomActivity } from "./rooms";
import type { CardActor } from "./retroCards";
import { refusal } from "./refusal";
import type { TopicRef } from "./walk";
import { getRetro, policyOf, projectCard, type FullCard, type ProjectedCard, type ProjectionPolicy } from "./retro";
import {
  ACTION_NOT_FOUND,
  ACTION_NOTE_TOO_LONG,
  ACTION_TEXT_REQUIRED,
  ACTION_TEXT_TOO_LONG,
  CARD_NOT_FOUND,
  CLUSTER_NOT_FOUND,
  FORMER_MEMBER,
  HIDDEN_CARD_LABEL,
  NOTE_ONLY_ON_LEAVING_OPEN,
  OWNER_NOT_MEMBER,
} from "../retroCopy";

/**
 * Action items (spec §13, ADR-0017): a short text with at most one named
 * owner, an optional date and an optional source topic, living in exactly
 * one retro for its whole life and carried over by the fact of still being
 * open. Creation is never refused and correct in every stage (ADR-0010);
 * the owner may always edit, complete, drop or reopen their own; anyone
 * `actionManagement` allows may do so to another's, assign, and delete.
 * Every act bumps the activity chokepoint (spec §14), completing from the
 * team page included. Attribution never reaches an action (ADR-0012):
 * creator and owner are named in both modes.
 */

export const MAX_ACTION_TEXT = 500;
export const MAX_ACTION_NOTE = 500;

export type ActionStatus = Doc<"retroActions">["status"];

function validateText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw refusal("forbidden", ACTION_TEXT_REQUIRED);
  if (trimmed.length > MAX_ACTION_TEXT) throw refusal("forbidden", ACTION_TEXT_TOO_LONG);
  return trimmed;
}

function validateNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length > MAX_ACTION_NOTE) throw refusal("forbidden", ACTION_NOTE_TOO_LONG);
  return trimmed;
}

/** The row, or a `missing` refusal; a row of another room is missing here too. */
export async function requireAction(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  actionId: Id<"retroActions">
): Promise<Doc<"retroActions">> {
  const action = await ctx.db.get(actionId);
  if (!action || action.roomId !== roomId) {
    throw refusal("missing", ACTION_NOT_FOUND);
  }
  return action;
}

/** An owner must attend the retro (spec §13): any member, anonymous accounts included. */
async function requireOwnerAttends(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  ownerId: Id<"users">
): Promise<void> {
  const membership = await ctx.db
    .query("roomMemberships")
    .withIndex("by_room_user", (q) => q.eq("roomId", roomId).eq("userId", ownerId))
    .unique();
  if (!membership) throw refusal("forbidden", OWNER_NOT_MEMBER);
}

/** A source topic must be a live topic of the room; a gone one is `missing`. */
async function requireSource(ctx: QueryCtx, roomId: Id<"rooms">, source: TopicRef): Promise<void> {
  const topic = await ctx.db.get(source.id);
  if (!topic || topic.roomId !== roomId) {
    throw refusal("missing", source.kind === "card" ? CARD_NOT_FOUND : CLUSTER_NOT_FOUND);
  }
}

/** The `actionManagement` decision, resolved at most once per act. */
function management(ctx: QueryCtx, room: Doc<"rooms">, actor: CardActor): () => Promise<ResolvedDecision> {
  let decision: Promise<ResolvedDecision> | undefined;
  return () =>
    (decision ??= resolveRoomAction(ctx, actor.user, actor.membership, room, {
      kind: "category",
      category: "actionManagement",
    }).then((r) => r.decision));
}

/**
 * Own-item rights (spec §4.2): the owner may always edit, complete, drop or
 * reopen their own; anyone else needs `actionManagement`, read back as a
 * `forbidden` refusal the client can tell from a failure (ADR-0022).
 */
async function requireOwnerOrManagement(
  ctx: QueryCtx,
  room: Doc<"rooms">,
  actor: CardActor,
  action: Doc<"retroActions">
): Promise<void> {
  if (action.ownerId !== undefined && action.ownerId === actor.user._id) return;
  const decision = await management(ctx, room, actor)();
  if (!decision.allowed) throw refusal("forbidden", decision.message);
}

/** Assign and delete are `actionManagement` acts with no owner exception. */
async function requireManagement(ctx: QueryCtx, room: Doc<"rooms">, actor: CardActor): Promise<void> {
  const decision = await management(ctx, room, actor)();
  if (!decision.allowed) throw refusal("forbidden", decision.message);
}

/**
 * Create an action item (spec §13): never refused, in every stage. The
 * creator is named; the owner, when given, must attend; the source, when
 * given, must be a live topic. The Team is denormalised at write time
 * (ADR-0016); adoption stamps rows written before it (spec §5).
 */
export async function createAction(
  ctx: MutationCtx,
  args: {
    room: Doc<"rooms">;
    actor: CardActor;
    text: string;
    ownerId?: Id<"users">;
    dueAt?: number;
    source?: TopicRef;
  }
): Promise<Id<"retroActions">> {
  const text = validateText(args.text);
  if (args.ownerId !== undefined) await requireOwnerAttends(ctx, args.room._id, args.ownerId);
  if (args.source !== undefined) await requireSource(ctx, args.room._id, args.source);
  const now = Date.now();
  const id = await ctx.db.insert("retroActions", {
    roomId: args.room._id,
    ...(args.room.teamId !== undefined ? { teamId: args.room.teamId } : {}),
    text,
    ...(args.ownerId !== undefined ? { ownerId: args.ownerId } : {}),
    ...(args.dueAt !== undefined ? { dueAt: args.dueAt } : {}),
    ...(args.source !== undefined ? { source: args.source } : {}),
    status: "open",
    createdBy: args.actor.user._id,
    createdAt: now,
    updatedAt: now,
  });
  await updateRoomActivity(ctx, args.room);
  return id;
}

/** Edit the text and the due date (own, or under `actionManagement`); `dueAt: null` clears it. */
export async function updateAction(
  ctx: MutationCtx,
  args: {
    room: Doc<"rooms">;
    actor: CardActor;
    actionId: Id<"retroActions">;
    text?: string;
    dueAt?: number | null;
  }
): Promise<void> {
  const action = await requireAction(ctx, args.room._id, args.actionId);
  await requireOwnerOrManagement(ctx, args.room, args.actor, action);
  await ctx.db.patch(action._id, {
    ...(args.text !== undefined ? { text: validateText(args.text) } : {}),
    ...(args.dueAt === null ? { dueAt: undefined } : args.dueAt !== undefined ? { dueAt: args.dueAt } : {}),
    updatedAt: Date.now(),
  });
  await updateRoomActivity(ctx, args.room);
}

/**
 * Change the status (own, or under `actionManagement`): `open → done |
 * dropped → open`, all reversible. The note is invited only on leaving
 * `open` (ADR-0017) and cleared on reopening, so a note always explains the
 * status the row shows.
 */
export async function setActionStatus(
  ctx: MutationCtx,
  args: {
    room: Doc<"rooms">;
    actor: CardActor;
    actionId: Id<"retroActions">;
    status: ActionStatus;
    note?: string;
  }
): Promise<void> {
  const action = await requireAction(ctx, args.room._id, args.actionId);
  await requireOwnerOrManagement(ctx, args.room, args.actor, action);
  const leavingOpen = action.status === "open" && args.status !== "open";
  if (args.note !== undefined && args.note.trim() !== "" && !leavingOpen) {
    throw refusal("forbidden", NOTE_ONLY_ON_LEAVING_OPEN);
  }
  const note = leavingOpen && args.note !== undefined ? validateNote(args.note) : undefined;
  await ctx.db.patch(action._id, {
    status: args.status,
    note: args.status === "open" ? undefined : note !== undefined && note !== "" ? note : action.note,
    updatedAt: Date.now(),
  });
  await updateRoomActivity(ctx, args.room);
}

/** Assign or unassign (`actionManagement`, no accept step); the owner must attend. */
export async function assignAction(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; actionId: Id<"retroActions">; ownerId?: Id<"users"> }
): Promise<void> {
  const action = await requireAction(ctx, args.room._id, args.actionId);
  await requireManagement(ctx, args.room, args.actor);
  if (args.ownerId !== undefined) await requireOwnerAttends(ctx, args.room._id, args.ownerId);
  await ctx.db.patch(action._id, { ownerId: args.ownerId, updatedAt: Date.now() });
  await updateRoomActivity(ctx, args.room);
}

/** Delete (`actionManagement`): a separate act from dropping (ADR-0017). */
export async function deleteAction(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; actionId: Id<"retroActions"> }
): Promise<void> {
  const action = await requireAction(ctx, args.room._id, args.actionId);
  await requireManagement(ctx, args.room, args.actor);
  await ctx.db.delete(action._id);
  await updateRoomActivity(ctx, args.room);
}

/** Whether a stored source names this topic. */
const sameTopic = (a: TopicRef, b: TopicRef) => a.kind === b.kind && a.id === b.id;

/**
 * How many action rows one index read carries: a retro's items, a Team's
 * open items, a source's re-point (ADR-0024: bounded, never a stored counter).
 */
export const MAX_ACTION_ROWS = 500;

/**
 * A topic's departure (spec §10.3, §13): the sources naming it are nulled
 * when a cluster is dissolved or a card deleted, and re-pointed to the
 * survivor when clusters merge, so a link never dangles. Bounded like the
 * room's other reads; no chokepoint call, the caller's act bumps.
 */
export async function repointSources(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  from: TopicRef,
  to?: TopicRef
): Promise<void> {
  const rows = await ctx.db
    .query("retroActions")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_ACTION_ROWS);
  await Promise.all(
    rows
      .filter((row) => row.source !== undefined && sameTopic(row.source, from))
      .map((row) => ctx.db.patch(row._id, { source: to, updatedAt: Date.now() }))
  );
}

// --- Reads (spec §13, §5): this retro's items, the review, the team page ---

/** How many memberships one room's reassign roster carries. */
const MAX_ROSTER_ROWS = 500;

export interface ActionSourceRead {
  kind: TopicRef["kind"];
  id: Id<"retroCards"> | Id<"retroClusters">;
  /** The cluster's name or the card's text through the projection; never an author. */
  label: string;
}

/** What the viewer may do to one item, decided server-side like the guard would (spec §4.2). */
export interface ActionRights {
  /** Edit, complete, drop or reopen: own, or under `actionManagement`. */
  edit: boolean;
  /** Assign and delete: `actionManagement`. */
  manage: boolean;
}

export interface ActionRead {
  _id: Id<"retroActions">;
  roomId: Id<"rooms">;
  roomName: string;
  text: string;
  status: ActionStatus;
  note?: string;
  dueAt?: number;
  ownerId?: Id<"users">;
  /** The owner's name, or the register's former member; absent when unowned. */
  ownerName?: string;
  createdBy: Id<"users">;
  creatorName: string;
  createdAt: number;
  updatedAt: number;
  source?: ActionSourceRead;
  rights: ActionRights;
}

export interface ActionRoomRead {
  roomId: Id<"rooms">;
  name: string;
  /** Every attendee, for the reassign picker: an owner must attend (spec §13). */
  members: { userId: Id<"users">; name: string }[];
  /** Whether the viewer attends; a Team reader reads and acts on nothing (ADR-0009). */
  attending: boolean;
}

export interface ActionsRead {
  items: ActionRead[];
  /** The rooms the items belong to, once each; a retro's own read carries its room even with no items. */
  rooms: ActionRoomRead[];
}

/** One room's part of the projection, loaded once per read. */
interface RoomContext {
  room: Doc<"rooms">;
  policy: ProjectionPolicy | null;
  members: { userId: Id<"users">; name: string }[];
  /** The viewer's membership in this room, or null for a Team reader. */
  membership: Doc<"roomMemberships"> | null;
  manage: boolean;
}

async function loadRoomContext(
  ctx: QueryCtx,
  viewer: Doc<"users">,
  roomId: Id<"rooms">,
  users: Map<Id<"users">, Doc<"users"> | null>
): Promise<RoomContext | null> {
  const room = await ctx.db.get(roomId);
  if (!room) return null;
  const [retro, rows] = await Promise.all([
    getRetro(ctx, roomId),
    ctx.db
      .query("roomMemberships")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(MAX_ROSTER_ROWS),
  ]);
  const members: RoomContext["members"] = [];
  for (const row of rows) {
    const user = await userOf(ctx, users, row.userId);
    if (user) members.push({ userId: user._id, name: user.name });
  }
  const membership = rows.find((row) => row.userId === viewer._id) ?? null;
  const manage = membership
    ? (
        await resolveRoomAction(ctx, viewer, membership, room, {
          kind: "category",
          category: "actionManagement",
        })
      ).decision.allowed
    : false;
  return { room, policy: retro ? policyOf(retro) : null, members, membership, manage };
}

async function userOf(
  ctx: QueryCtx,
  users: Map<Id<"users">, Doc<"users"> | null>,
  userId: Id<"users">
): Promise<Doc<"users"> | null> {
  if (!users.has(userId)) users.set(userId, await ctx.db.get(userId));
  return users.get(userId)!;
}

/** A silhouette has no text (ADR-0015). */
const isFullCard = (card: ProjectedCard): card is FullCard => "text" in card;

/** A source's label: the cluster's name, or the card's text through the room's projection (ADR-0012, ADR-0015). */
async function sourceOf(
  ctx: QueryCtx,
  context: RoomContext,
  source: TopicRef
): Promise<ActionSourceRead | undefined> {
  if (source.kind === "cluster") {
    const cluster = await ctx.db.get(source.id);
    return cluster ? { kind: "cluster", id: cluster._id, label: cluster.name } : undefined;
  }
  const card = await ctx.db.get(source.id);
  if (!card) return undefined;
  const projected = context.policy ? projectCard(context.policy, null, card) : undefined;
  const label = projected !== undefined && isFullCard(projected) ? projected.text : HIDDEN_CARD_LABEL;
  return { kind: "card", id: card._id, label };
}

/**
 * The one projection every action read goes through: names by reference
 * (a missing user is the register's former member), the source's label
 * through the room's own card projection, and the viewer's rights decided
 * the way the mutations decide them. Rows of a room that is gone
 * (mid-cascade) drop out.
 */
export async function projectActions(
  ctx: QueryCtx,
  viewer: Doc<"users">,
  actions: readonly Doc<"retroActions">[],
  /** Rooms in the read whatever the rows: the retro whose panel composes the next item. */
  always: readonly Id<"rooms">[] = []
): Promise<ActionsRead> {
  const users = new Map<Id<"users">, Doc<"users"> | null>();
  const contexts = new Map<Id<"rooms">, RoomContext | null>();
  const contextOf = async (roomId: Id<"rooms">) => {
    if (!contexts.has(roomId)) contexts.set(roomId, await loadRoomContext(ctx, viewer, roomId, users));
    return contexts.get(roomId) ?? null;
  };
  for (const roomId of always) await contextOf(roomId);
  const items: ActionRead[] = [];
  for (const action of actions) {
    const context = await contextOf(action.roomId);
    if (!context) continue;
    const [owner, creator] = await Promise.all([
      action.ownerId !== undefined ? userOf(ctx, users, action.ownerId) : null,
      userOf(ctx, users, action.createdBy),
    ]);
    const own = context.membership !== null && action.ownerId === viewer._id;
    const source = action.source !== undefined ? await sourceOf(ctx, context, action.source) : undefined;
    items.push({
      _id: action._id,
      roomId: action.roomId,
      roomName: context.room.name,
      text: action.text,
      status: action.status,
      ...(action.note !== undefined ? { note: action.note } : {}),
      ...(action.dueAt !== undefined ? { dueAt: action.dueAt } : {}),
      ...(action.ownerId !== undefined
        ? { ownerId: action.ownerId, ownerName: owner?.name ?? FORMER_MEMBER }
        : {}),
      createdBy: action.createdBy,
      creatorName: creator?.name ?? FORMER_MEMBER,
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
      ...(source ? { source } : {}),
      rights: { edit: own || context.manage, manage: context.manage },
    });
  }
  const rooms: ActionRoomRead[] = [];
  for (const [roomId, context] of contexts) {
    if (context) {
      rooms.push({
        roomId,
        name: context.room.name,
        members: context.members,
        attending: context.membership !== null,
      });
    }
  }
  return { items, rooms };
}

const byCreation = (a: Doc<"retroActions">, b: Doc<"retroActions">) => a.createdAt - b.createdAt;

/** This retro's items, every status, oldest first: the actions panel at any stage (spec §13). */
export async function roomActions(
  ctx: QueryCtx,
  viewer: Doc<"users">,
  roomId: Id<"rooms">
): Promise<ActionsRead> {
  const rows = await ctx.db
    .query("retroActions")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_ACTION_ROWS);
  return projectActions(ctx, viewer, rows.sort(byCreation), [roomId]);
}

/** The Team's open items from the index, a bounded window, oldest first. */
async function openTeamRows(ctx: QueryCtx, teamId: Id<"teams">): Promise<Doc<"retroActions">[]> {
  const rows = await ctx.db
    .query("retroActions")
    .withIndex("by_team_status", (q) => q.eq("teamId", teamId).eq("status", "open"))
    .take(MAX_ACTION_ROWS);
  return rows.sort(byCreation);
}

/**
 * `retro.reviewActions` (spec §13, ADR-0017): the Team's open items whose
 * home is another retro, oldest first; this retro's own are never in its
 * review, and a teamless retro has nothing to carry from. The index is
 * read with a bound and this room filtered out in code.
 */
export async function reviewActions(
  ctx: QueryCtx,
  viewer: Doc<"users">,
  room: Doc<"rooms">
): Promise<ActionsRead> {
  if (room.teamId === undefined) return { items: [], rooms: [] };
  const rows = (await openTeamRows(ctx, room.teamId)).filter((row) => row.roomId !== room._id);
  return projectActions(ctx, viewer, rows);
}

/** `teams.openActions` (spec §5): every open item across the Team's retros, oldest first. */
export async function teamOpenActions(
  ctx: QueryCtx,
  viewer: Doc<"users">,
  teamId: Id<"teams">
): Promise<ActionsRead> {
  return projectActions(ctx, viewer, await openTeamRows(ctx, teamId));
}
