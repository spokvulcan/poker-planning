import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { refusal } from "./refusal";
import { resolveRoomAction } from "./auth";
import { getMembership } from "./users";
import { updateRoomActivity, validateRoomName } from "./rooms";
import {
  columnsFromTemplate,
  DEFAULT_VOTES_PER_PERSON,
  MAX_ACTION_TEXT_LENGTH,
  MAX_ACTIONS_PER_ROOM,
  MAX_COLUMN_TITLE_LENGTH,
  MAX_COLUMNS,
  MAX_STICKIES_PER_ROOM,
  MAX_STICKY_TEXT_LENGTH,
  MAX_VOTES_PER_PERSON,
  MIN_VOTES_PER_PERSON,
  nextColumnId,
  STICKY_COLORS,
  type RetroColumn,
  type RetroStep,
  type StickyColor,
} from "../retroTemplates";
import { discussionOrder, normalizeGifUrl, rootOf, stepFocus, voteTotals } from "../retroRules";
import {
  actionsPosition,
  nextPadPosition,
  padPositions,
  RETRO_NODE_POSITION,
  RETRO_TIMER_POSITION,
} from "../retroLayout";
import type { Position } from "../canvasLayout";

export type RetroState = NonNullable<Doc<"rooms">["retro"]>;
export type Gif = NonNullable<Doc<"retroStickies">["gif"]>;

/** The retro state of a room, or a refusal when the room is not a retro. */
export function retroOf(room: Doc<"rooms">): RetroState {
  if (room.roomType !== "retro" || !room.retro) {
    throw refusal("missing", "This is not a retro.");
  }
  return room.retro;
}

// --- Creation -------------------------------------------------------------------

export interface CreateRetroArgs {
  name: string;
  templateId?: string;
  owner: Doc<"users">;
  /** Copied from the retro this one follows; the template is ignored then. */
  columns?: RetroColumn[];
  votesPerPerson?: number;
  showAuthors?: boolean;
}

/**
 * Opens a retro: the room with its state, and the board's fixed nodes (the
 * retro node, the timer, one pad per column, the action items) where
 * retroLayout puts them. A retro made by a permanent account is retained;
 * a guest's expires with the poker rooms.
 */
export async function createRetro(ctx: MutationCtx, args: CreateRetroArgs): Promise<Id<"rooms">> {
  const now = Date.now();
  const columns = args.columns ?? columnsFromTemplate(args.templateId);
  const roomId = await ctx.db.insert("rooms", {
    name: validateRoomName(args.name),
    roomType: "retro",
    autoCompleteVoting: false,
    isGameOver: false,
    createdAt: now,
    lastActivityAt: now,
    retained: args.owner.accountType === "permanent",
    ownerId: args.owner._id,
    retro: {
      step: "write",
      columns,
      votesPerPerson: args.votesPerPerson ?? DEFAULT_VOTES_PER_PERSON,
      showAuthors: args.showAuthors ?? false,
    },
  });

  const pads = padPositions(columns.length);
  await Promise.all([
    insertNode(ctx, roomId, "retro", "retro", RETRO_NODE_POSITION, {}),
    insertNode(ctx, roomId, "timer", "timer", RETRO_TIMER_POSITION, {
      startedAt: null,
      pausedAt: null,
      elapsedSeconds: 0,
      lastUpdatedBy: null,
      lastAction: null,
    }),
    insertNode(ctx, roomId, "actions", "actions", actionsPosition(columns.length), {}),
    ...columns.map((column, i) =>
      insertNode(ctx, roomId, padNodeId(column.id), "pad", pads[i], { columnId: column.id })
    ),
  ]);
  return roomId;
}

/** The canvas node id of a column's pad. */
export function padNodeId(columnId: string): string {
  return `pad-${columnId}`;
}

async function insertNode(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  nodeId: string,
  type: "retro" | "timer" | "pad" | "actions",
  position: Position,
  data: Record<string, unknown>
): Promise<void> {
  await ctx.db.insert("canvasNodes", {
    roomId,
    nodeId,
    type,
    position: { ...position },
    data,
    lastUpdatedAt: Date.now(),
  });
}

/**
 * "Sprint 42 retro" follows "Sprint 41 retro"; a name without a number
 * gets one.
 */
export function nextRetroName(name: string): string {
  const match = name.match(/^(.*?)(\d+)(\D*)$/);
  if (match) return `${match[1]}${Number(match[2]) + 1}${match[3]}`;
  return `${name} 2`;
}

/**
 * Opens the retro that follows this one, once: same columns and settings,
 * every open action item carried over, and the link left on this retro so
 * everyone can follow. Asking again returns the same room.
 */
export async function startNextRetro(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  owner: Doc<"users">
): Promise<Id<"rooms">> {
  const retro = retroOf(room);
  if (retro.nextRoomId && (await ctx.db.get(retro.nextRoomId))) {
    return retro.nextRoomId;
  }
  const nextRoomId = await createRetro(ctx, {
    name: nextRetroName(room.name),
    owner,
    columns: retro.columns,
    votesPerPerson: retro.votesPerPerson,
    showAuthors: retro.showAuthors,
  });
  const open = (await actionItemsOf(ctx, room._id)).filter((item) => !item.done);
  const now = Date.now();
  await Promise.all(
    open.map((item) =>
      ctx.db.insert("retroActionItems", {
        roomId: nextRoomId,
        text: item.text,
        done: false,
        ...(item.ownerId ? { ownerId: item.ownerId } : {}),
        createdBy: item.createdBy,
        carriedOver: true,
        createdAt: now,
      })
    )
  );
  await ctx.db.patch(room._id, { retro: { ...retro, nextRoomId } });
  await updateRoomActivity(ctx, room);
  return nextRoomId;
}

// --- Reads ----------------------------------------------------------------------

async function stickiesOf(ctx: QueryCtx, roomId: Id<"rooms">): Promise<Doc<"retroStickies">[]> {
  return await ctx.db
    .query("retroStickies")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_STICKIES_PER_ROOM);
}

async function votesOf(ctx: QueryCtx, roomId: Id<"rooms">): Promise<Doc<"retroStickyVotes">[]> {
  // At most one vote per person per topic, so the stickies cap bounds it too.
  return await ctx.db
    .query("retroStickyVotes")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_STICKIES_PER_ROOM * MAX_VOTES_PER_PERSON);
}

async function actionItemsOf(ctx: QueryCtx, roomId: Id<"rooms">): Promise<Doc<"retroActionItems">[]> {
  return await ctx.db
    .query("retroActionItems")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_ACTIONS_PER_ROOM);
}

/**
 * A sticky as one viewer may see it. Someone else's sticky is face-down
 * while the retro is in `write`: its place and colour, nothing it says.
 * The author travels only when the retro shows authors; `mine` is how the
 * author finds their own in an anonymous retro.
 */
export interface StickyView {
  _id: Id<"retroStickies">;
  clientId: string;
  columnId: string;
  position: Position;
  stackId?: Id<"retroStickies">;
  createdAt: number;
  mine: boolean;
  hidden: boolean;
  text?: string;
  gif?: Gif;
  authorName?: string;
  /** On a topic (a loose sticky or a stack's root): whether the viewer voted for it. */
  myVote?: boolean;
  /** On a topic, from `discuss` on: its votes, the whole stack's. */
  votes?: number;
}

export interface BoardView {
  stickies: StickyView[];
  /** How many different people have written a sticky. */
  writers: number;
  /** Votes cast by everyone, and by the viewer. */
  votesCast: number;
  myVotes: number;
}

/** The board as the viewer may see it (the server-side projection). */
export async function getBoard(
  ctx: QueryCtx,
  room: Doc<"rooms">,
  viewerId: Id<"users">
): Promise<BoardView> {
  const retro = retroOf(room);
  const [stickies, votes] = await Promise.all([stickiesOf(ctx, room._id), votesOf(ctx, room._id)]);
  const hideOthers = retro.step === "write";
  const showTotals = retro.step === "discuss" || retro.step === "done";

  const totals = voteTotals(stickies, votes);
  const rootById = new Map(stickies.map((s) => [s._id as string, rootOf(s)]));
  const myTopics = new Set(
    votes.filter((v) => v.voterId === viewerId).map((v) => rootById.get(v.stickyId))
  );

  const authorNames = new Map<string, string>();
  if (retro.showAuthors && !hideOthers) {
    const authorIds = [...new Set(stickies.map((s) => s.authorId))];
    const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)));
    authors.forEach((author, i) => authorNames.set(authorIds[i], author?.name ?? "Former member"));
  }

  const views = stickies.map((sticky): StickyView => {
    const mine = sticky.authorId === viewerId;
    const hidden = hideOthers && !mine;
    const isTopic = sticky.stackId === undefined;
    return {
      _id: sticky._id,
      clientId: sticky.clientId,
      columnId: sticky.columnId,
      position: sticky.position,
      ...(sticky.stackId ? { stackId: sticky.stackId } : {}),
      createdAt: sticky.createdAt,
      mine,
      hidden,
      ...(hidden
        ? {}
        : {
            text: sticky.text,
            ...(sticky.gif ? { gif: sticky.gif } : {}),
            ...(authorNames.has(sticky.authorId) ? { authorName: authorNames.get(sticky.authorId) } : {}),
          }),
      ...(isTopic ? { myVote: myTopics.has(sticky._id) } : {}),
      ...(isTopic && showTotals ? { votes: totals.get(sticky._id) ?? 0 } : {}),
    };
  });

  return {
    stickies: views,
    writers: new Set(stickies.map((s) => s.authorId)).size,
    votesCast: votes.length,
    myVotes: votes.filter((v) => v.voterId === viewerId).length,
  };
}

export interface ActionItemView {
  _id: Id<"retroActionItems">;
  text: string;
  done: boolean;
  ownerId?: Id<"users">;
  ownerName?: string;
  carriedOver: boolean;
  createdAt: number;
}

/** The action items, carried-over ones first, each list oldest first. */
export async function getActionItems(ctx: QueryCtx, roomId: Id<"rooms">): Promise<ActionItemView[]> {
  const items = await actionItemsOf(ctx, roomId);
  const ownerIds = [...new Set(items.flatMap((i) => (i.ownerId ? [i.ownerId] : [])))];
  const owners = await Promise.all(ownerIds.map((id) => ctx.db.get(id)));
  const names = new Map(ownerIds.map((id, i) => [id as string, owners[i]?.name ?? "Former member"]));
  return items
    .map((item) => ({
      _id: item._id,
      text: item.text,
      done: item.done,
      ...(item.ownerId ? { ownerId: item.ownerId, ownerName: names.get(item.ownerId) } : {}),
      carriedOver: item.carriedOver ?? false,
      createdAt: item.createdAt,
    }))
    .sort((a, b) => Number(b.carriedOver) - Number(a.carriedOver) || a.createdAt - b.createdAt);
}

export interface RetroListing {
  roomId: Id<"rooms">;
  name: string;
  step: RetroStep;
  columns: RetroColumn[];
  createdAt: number;
  lastActivityAt: number;
  retained: boolean;
  openActions: number;
  doneActions: number;
}

/** How many of a person's rooms the retro listing walks, newest memberships first. */
const LISTED_MEMBERSHIPS = 200;
const LISTED_RETROS = 50;

/** The retros a person has joined, newest first. */
export async function listRetrosOf(ctx: QueryCtx, userId: Id<"users">): Promise<RetroListing[]> {
  const memberships = await ctx.db
    .query("roomMemberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(LISTED_MEMBERSHIPS);
  const rooms = await Promise.all(memberships.map((m) => ctx.db.get(m.roomId)));
  const retros = rooms
    .filter((room): room is Doc<"rooms"> & { retro: RetroState } => room?.roomType === "retro" && !!room.retro)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, LISTED_RETROS);
  return await Promise.all(
    retros.map(async (room) => {
      const items = await actionItemsOf(ctx, room._id);
      return {
        roomId: room._id,
        name: room.name,
        step: room.retro.step,
        columns: room.retro.columns,
        createdAt: room.createdAt,
        lastActivityAt: room.lastActivityAt,
        retained: room.retained,
        openActions: items.filter((i) => !i.done).length,
        doneActions: items.filter((i) => i.done).length,
      };
    })
  );
}

// --- Steps and the discussion ----------------------------------------------------

/**
 * Moves the retro to a step. Entering `discuss` from an earlier step starts
 * the walk at the most-voted topic; going back before it drops the walk.
 * Nothing else changes: no sticky is locked, no vote is lost.
 */
export async function setStep(ctx: MutationCtx, room: Doc<"rooms">, step: RetroStep): Promise<void> {
  const retro = retroOf(room);
  if (retro.step === step) return;
  let focusStickyId = retro.focusStickyId;
  if (step === "write" || step === "vote") {
    focusStickyId = undefined;
  } else if (step === "discuss" && (retro.step === "write" || retro.step === "vote")) {
    const order = await orderOf(ctx, room._id, retro.columns);
    focusStickyId = order[0];
  }
  await ctx.db.patch(room._id, { retro: withFocus({ ...retro, step }, focusStickyId) });
  await updateRoomActivity(ctx, room);
}

/** Moves the walk one topic on or back. */
export async function stepDiscussion(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  direction: "next" | "previous"
): Promise<void> {
  const retro = retroOf(room);
  if (retro.step !== "discuss") throw refusal("stage", "The topics are walked in Discuss.");
  const order = await orderOf(ctx, room._id, retro.columns);
  const focus = stepFocus(order, retro.focusStickyId, direction) as Id<"retroStickies"> | undefined;
  await ctx.db.patch(room._id, { retro: withFocus(retro, focus) });
  await updateRoomActivity(ctx, room);
}

/** Puts one topic in the spotlight, voted for or not (a late sticky, say). */
export async function focusTopic(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  stickyId: Id<"retroStickies">
): Promise<void> {
  const retro = retroOf(room);
  if (retro.step === "write") throw refusal("stage", "Reveal the stickies first.");
  const sticky = await stickyInRoom(ctx, room._id, stickyId);
  const step = retro.step === "done" ? "done" : "discuss";
  await ctx.db.patch(room._id, {
    retro: withFocus({ ...retro, step }, rootOf(sticky) as Id<"retroStickies">),
  });
  await updateRoomActivity(ctx, room);
}

async function orderOf(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  columns: readonly RetroColumn[]
): Promise<Id<"retroStickies">[]> {
  const [stickies, votes] = await Promise.all([stickiesOf(ctx, roomId), votesOf(ctx, roomId)]);
  return discussionOrder(stickies, voteTotals(stickies, votes), columns) as Id<"retroStickies">[];
}

/** The state with the focus set or cleared (an optional field is dropped, not set to undefined). */
function withFocus(retro: RetroState, focus: Id<"retroStickies"> | undefined): RetroState {
  const { focusStickyId: _dropped, ...rest } = retro;
  return focus ? { ...rest, focusStickyId: focus } : rest;
}

// --- Settings and columns --------------------------------------------------------

export async function updateSettings(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  patch: { votesPerPerson?: number; showAuthors?: boolean }
): Promise<void> {
  const retro = retroOf(room);
  if (patch.votesPerPerson !== undefined && !Number.isFinite(patch.votesPerPerson)) {
    throw refusal("forbidden", "Votes per person must be a number.");
  }
  const votesPerPerson =
    patch.votesPerPerson === undefined
      ? retro.votesPerPerson
      : Math.min(Math.max(Math.round(patch.votesPerPerson), MIN_VOTES_PER_PERSON), MAX_VOTES_PER_PERSON);
  await ctx.db.patch(room._id, {
    retro: { ...retro, votesPerPerson, showAuthors: patch.showAuthors ?? retro.showAuthors },
  });
  await updateRoomActivity(ctx, room);
}

function validateColumnTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw refusal("forbidden", "A column needs a title.");
  if (trimmed.length > MAX_COLUMN_TITLE_LENGTH) {
    throw refusal("forbidden", `Keep column titles under ${MAX_COLUMN_TITLE_LENGTH} characters.`);
  }
  return trimmed;
}

function validateEmoji(emoji: string): string {
  const trimmed = emoji.trim();
  // An emoji is a handful of code units (flags and ZWJ sequences included).
  if (!trimmed || trimmed.length > 16) throw refusal("forbidden", "Pick one emoji.");
  return trimmed;
}

export async function updateColumn(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  columnId: string,
  patch: { title?: string; emoji?: string; color?: StickyColor }
): Promise<void> {
  const retro = retroOf(room);
  if (!retro.columns.some((c) => c.id === columnId)) throw refusal("missing", "That column is gone.");
  if (patch.color && !STICKY_COLORS.includes(patch.color)) throw refusal("forbidden", "Unknown colour.");
  const columns = retro.columns.map((column) =>
    column.id === columnId
      ? {
          ...column,
          ...(patch.title !== undefined ? { title: validateColumnTitle(patch.title) } : {}),
          ...(patch.emoji !== undefined ? { emoji: validateEmoji(patch.emoji) } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
        }
      : column
  );
  await ctx.db.patch(room._id, { retro: { ...retro, columns } });
  await updateRoomActivity(ctx, room);
}

/** Adds a column, its pad one step right of the rightmost pad. */
export async function addColumn(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  column: { title: string; emoji: string; color: StickyColor }
): Promise<string> {
  const retro = retroOf(room);
  if (retro.columns.length >= MAX_COLUMNS) throw refusal("forbidden", `A retro has at most ${MAX_COLUMNS} columns.`);
  if (!STICKY_COLORS.includes(column.color)) throw refusal("forbidden", "Unknown colour.");
  const id = nextColumnId(retro.columns);
  const pads = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_type", (q) => q.eq("roomId", room._id).eq("type", "pad"))
    .take(MAX_COLUMNS * 2);
  await ctx.db.patch(room._id, {
    retro: {
      ...retro,
      columns: [...retro.columns, { id, title: validateColumnTitle(column.title), emoji: validateEmoji(column.emoji), color: column.color }],
    },
  });
  await insertNode(ctx, room._id, padNodeId(id), "pad", nextPadPosition(pads.map((p) => p.position)), { columnId: id });
  await updateRoomActivity(ctx, room);
  return id;
}

/** Removes an empty column and its pad; a column with stickies stays. */
export async function removeColumn(ctx: MutationCtx, room: Doc<"rooms">, columnId: string): Promise<void> {
  const retro = retroOf(room);
  if (!retro.columns.some((c) => c.id === columnId)) return;
  if (retro.columns.length <= 1) throw refusal("forbidden", "A retro needs at least one column.");
  const stickies = await stickiesOf(ctx, room._id);
  if (stickies.some((s) => s.columnId === columnId)) {
    throw refusal("forbidden", "Move or delete this column's stickies first.");
  }
  await ctx.db.patch(room._id, { retro: { ...retro, columns: retro.columns.filter((c) => c.id !== columnId) } });
  const pad = await ctx.db
    .query("canvasNodes")
    .withIndex("by_room_node", (q) => q.eq("roomId", room._id).eq("nodeId", padNodeId(columnId)))
    .unique();
  if (pad) await ctx.db.delete(pad._id);
  await updateRoomActivity(ctx, room);
}

// --- Stickies --------------------------------------------------------------------

function validateStickyText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length > MAX_STICKY_TEXT_LENGTH) {
    throw refusal("forbidden", `Keep stickies under ${MAX_STICKY_TEXT_LENGTH} characters.`);
  }
  return trimmed;
}

function validateGif(gif: Gif): Gif {
  const url = normalizeGifUrl(gif.url);
  if (!url) throw refusal("forbidden", "That GIF link can't be used. Try GIPHY, Tenor or Imgur.");
  const size = (n: number) => (Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 2000) : 200);
  return {
    url,
    width: size(gif.width),
    height: size(gif.height),
    ...(gif.title ? { title: gif.title.slice(0, 140) } : {}),
  };
}

function validatePosition(position: Position): Position {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw refusal("forbidden", "That spot is off the board.");
  }
  const clamp = (n: number) => Math.min(Math.max(n, -100_000), 100_000);
  return { x: clamp(position.x), y: clamp(position.y) };
}

async function stickyInRoom(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  stickyId: Id<"retroStickies">
): Promise<Doc<"retroStickies">> {
  const sticky = await ctx.db.get(stickyId);
  if (!sticky || sticky.roomId !== roomId) throw refusal("missing", "That sticky is gone.");
  return sticky;
}

/**
 * Whether the actor may change what a sticky says or remove it: always their
 * own, someone else's only under `cardManagement`.
 */
async function requireStickyEditor(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  sticky: Doc<"retroStickies">,
  user: Doc<"users">
): Promise<void> {
  if (sticky.authorId === user._id) return;
  // Before the reveal a sticky is its author's alone: nobody moderates what they can't read.
  if (retroOf(room).step === "write") {
    throw refusal("stage", "Stickies can be edited by others once they're revealed.");
  }
  const membership = await getMembership(ctx, room._id, user._id);
  if (!membership) throw refusal("forbidden", "Join the retro first.");
  const { decision } = await resolveRoomAction(ctx, membership, room, {
    kind: "category",
    category: "cardManagement",
  });
  if (!decision.allowed) throw refusal("forbidden", "Only the author or a facilitator can change this sticky.");
}

export interface AddStickyArgs {
  clientId: string;
  columnId: string;
  text: string;
  gif?: Gif;
  position: Position;
}

/** Sticks a new sticky on the board. A repeated `clientId` is the same sticky. */
export async function addSticky(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  author: Doc<"users">,
  args: AddStickyArgs
): Promise<Id<"retroStickies">> {
  const retro = retroOf(room);
  if (!args.clientId || args.clientId.length > 64) throw refusal("forbidden", "That sticky's id is malformed.");
  const existing = await ctx.db
    .query("retroStickies")
    .withIndex("by_room_client", (q) => q.eq("roomId", room._id).eq("clientId", args.clientId))
    .unique();
  if (existing) return existing._id;
  if (!retro.columns.some((c) => c.id === args.columnId)) throw refusal("missing", "That column is gone.");
  const text = validateStickyText(args.text);
  const gif = args.gif ? validateGif(args.gif) : undefined;
  if (!text && !gif) throw refusal("forbidden", "Write something or add a GIF.");
  const count = (await stickiesOf(ctx, room._id)).length;
  if (count >= MAX_STICKIES_PER_ROOM) throw refusal("forbidden", "This board is full.");
  const now = Date.now();
  const id = await ctx.db.insert("retroStickies", {
    roomId: room._id,
    clientId: args.clientId,
    columnId: args.columnId,
    text,
    ...(gif ? { gif } : {}),
    authorId: author._id,
    position: validatePosition(args.position),
    createdAt: now,
    updatedAt: now,
  });
  await updateRoomActivity(ctx, room);
  return id;
}

/** Rewrites a sticky's text or GIF (`gif: null` takes the GIF off). */
export async function updateSticky(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  user: Doc<"users">,
  stickyId: Id<"retroStickies">,
  patch: { text?: string; gif?: Gif | null; columnId?: string }
): Promise<void> {
  const retro = retroOf(room);
  const sticky = await stickyInRoom(ctx, room._id, stickyId);
  await requireStickyEditor(ctx, room, sticky, user);
  const text = patch.text === undefined ? sticky.text : validateStickyText(patch.text);
  const gif = patch.gif === undefined ? sticky.gif : patch.gif === null ? undefined : validateGif(patch.gif);
  if (!text && !gif) throw refusal("forbidden", "A sticky needs words or a GIF.");
  if (patch.columnId !== undefined && !retro.columns.some((c) => c.id === patch.columnId)) {
    throw refusal("missing", "That column is gone.");
  }
  const { gif: _old, ...rest } = sticky;
  await ctx.db.replace(sticky._id, {
    ...rest,
    text,
    ...(gif ? { gif } : {}),
    ...(patch.columnId !== undefined ? { columnId: patch.columnId } : {}),
    updatedAt: Date.now(),
  });
  await updateRoomActivity(ctx, room);
}

/** Moves stickies. Anyone in the retro may move any sticky: it's a whiteboard. */
export async function moveStickies(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  moves: readonly { stickyId: Id<"retroStickies">; position: Position }[]
): Promise<void> {
  retroOf(room);
  if (moves.length > 200) throw refusal("forbidden", "Too many stickies at once.");
  await Promise.all(
    moves.map(async (move) => {
      const sticky = await ctx.db.get(move.stickyId);
      // A sticky deleted mid-drag is simply skipped.
      if (!sticky || sticky.roomId !== room._id) return;
      await ctx.db.patch(sticky._id, { position: validatePosition(move.position) });
    })
  );
  await updateRoomActivity(ctx, room);
}

/**
 * Takes a sticky off the board, and its votes with it. A stack keeps its
 * other stickies: the oldest one left becomes the stack's top, and keeps
 * the stack's votes, which are filed under the top.
 */
export async function deleteSticky(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  user: Doc<"users">,
  stickyId: Id<"retroStickies">
): Promise<void> {
  const retro = retroOf(room);
  const sticky = await stickyInRoom(ctx, room._id, stickyId);
  await requireStickyEditor(ctx, room, sticky, user);

  const children = await ctx.db
    .query("retroStickies")
    .withIndex("by_stack", (q) => q.eq("stackId", sticky._id))
    .take(MAX_STICKIES_PER_ROOM);
  let heir: Id<"retroStickies"> | undefined;
  if (children.length > 0) {
    const [first, ...rest] = [...children].sort((a, b) => a.createdAt - b.createdAt);
    heir = first._id;
    const { stackId: _root, ...firstRest } = first;
    await ctx.db.replace(first._id, { ...firstRest, position: sticky.position });
    await Promise.all(rest.map((child) => ctx.db.patch(child._id, { stackId: first._id })));
  }

  const votes = await ctx.db
    .query("retroStickyVotes")
    .withIndex("by_sticky", (q) => q.eq("stickyId", sticky._id))
    .take(MAX_STICKIES_PER_ROOM * MAX_VOTES_PER_PERSON);
  await Promise.all(
    votes.map((vote) => (heir ? ctx.db.patch(vote._id, { stickyId: heir }) : ctx.db.delete(vote._id)))
  );
  await ctx.db.delete(sticky._id);

  if (retro.focusStickyId === sticky._id) {
    await ctx.db.patch(room._id, { retro: withFocus(retro, heir) });
  }
  await updateRoomActivity(ctx, room);
}

/**
 * Drops a sticky on another: it joins that sticky's stack, and brings its
 * own stack along. Face-down stickies can't be stacked, since nobody can
 * see what they are grouping.
 */
export async function stackSticky(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  user: Doc<"users">,
  stickyId: Id<"retroStickies">,
  ontoId: Id<"retroStickies">
): Promise<void> {
  const retro = retroOf(room);
  const [sticky, onto] = await Promise.all([
    stickyInRoom(ctx, room._id, stickyId),
    stickyInRoom(ctx, room._id, ontoId),
  ]);
  const target = rootOf(onto) as Id<"retroStickies">;
  if (target === sticky._id || rootOf(sticky) === target) return;
  if (retro.step === "write" && (sticky.authorId !== user._id || onto.authorId !== user._id)) {
    throw refusal("stage", "Stickies can be stacked once they're revealed.");
  }
  const children = await ctx.db
    .query("retroStickies")
    .withIndex("by_stack", (q) => q.eq("stackId", sticky._id))
    .take(MAX_STICKIES_PER_ROOM);
  await Promise.all([
    ctx.db.patch(sticky._id, { stackId: target }),
    ...children.map((child) => ctx.db.patch(child._id, { stackId: target })),
  ]);
  if (retro.focusStickyId === sticky._id) {
    await ctx.db.patch(room._id, { retro: withFocus(retro, target) });
  }
  await updateRoomActivity(ctx, room);
}

/** Pulls a sticky out of its stack and puts it down at `position`. */
export async function unstackSticky(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  stickyId: Id<"retroStickies">,
  position: Position
): Promise<void> {
  retroOf(room);
  const sticky = await stickyInRoom(ctx, room._id, stickyId);
  if (sticky.stackId === undefined) return;
  const { stackId: _root, ...rest } = sticky;
  await ctx.db.replace(sticky._id, { ...rest, position: validatePosition(position) });
  await updateRoomActivity(ctx, room);
}

// --- Votes -----------------------------------------------------------------------

/**
 * Votes for a topic, or takes the vote back. One vote per person per topic
 * (a stack is one topic), within the retro's budget, and only while the
 * retro is in `vote`.
 */
export async function toggleVote(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  voter: Doc<"users">,
  stickyId: Id<"retroStickies">
): Promise<void> {
  const retro = retroOf(room);
  if (retro.step !== "vote") throw refusal("stage", "Voting is closed.");
  const sticky = await stickyInRoom(ctx, room._id, stickyId);
  const topic = rootOf(sticky) as Id<"retroStickies">;
  const members = await ctx.db
    .query("retroStickies")
    .withIndex("by_stack", (q) => q.eq("stackId", topic))
    .take(MAX_STICKIES_PER_ROOM);
  const topicIds = new Set<string>([topic, ...members.map((m) => m._id)]);

  const mine = await ctx.db
    .query("retroStickyVotes")
    .withIndex("by_room_voter", (q) => q.eq("roomId", room._id).eq("voterId", voter._id))
    .take(MAX_VOTES_PER_PERSON + 1);
  const existing = mine.find((vote) => topicIds.has(vote.stickyId));
  if (existing) {
    await ctx.db.delete(existing._id);
  } else {
    if (mine.length >= retro.votesPerPerson) {
      throw refusal("budget", "You're out of votes. Take one back to vote again.");
    }
    await ctx.db.insert("retroStickyVotes", { roomId: room._id, stickyId: topic, voterId: voter._id });
  }
  await updateRoomActivity(ctx, room);
}

// --- Action items ----------------------------------------------------------------

function validateActionText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw refusal("forbidden", "An action item needs a few words.");
  if (trimmed.length > MAX_ACTION_TEXT_LENGTH) {
    throw refusal("forbidden", `Keep action items under ${MAX_ACTION_TEXT_LENGTH} characters.`);
  }
  return trimmed;
}

async function requireOwnerInRoom(ctx: QueryCtx, roomId: Id<"rooms">, ownerId: Id<"users">): Promise<void> {
  if (!(await getMembership(ctx, roomId, ownerId))) {
    throw refusal("missing", "That person isn't in this retro.");
  }
}

export async function addActionItem(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  creator: Doc<"users">,
  args: { text: string; ownerId?: Id<"users"> }
): Promise<Id<"retroActionItems">> {
  retroOf(room);
  const text = validateActionText(args.text);
  if ((await actionItemsOf(ctx, room._id)).length >= MAX_ACTIONS_PER_ROOM) {
    throw refusal("forbidden", "That's a lot of action items. Finish a few first.");
  }
  if (args.ownerId) await requireOwnerInRoom(ctx, room._id, args.ownerId);
  const id = await ctx.db.insert("retroActionItems", {
    roomId: room._id,
    text,
    done: false,
    ...(args.ownerId ? { ownerId: args.ownerId } : {}),
    createdBy: creator._id,
    createdAt: Date.now(),
  });
  await updateRoomActivity(ctx, room);
  return id;
}

export async function actionItemInRoom(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  itemId: Id<"retroActionItems">
): Promise<Doc<"retroActionItems">> {
  const item = await ctx.db.get(itemId);
  if (!item || item.roomId !== roomId) throw refusal("missing", "That action item is gone.");
  return item;
}

/** Edits an action item; `ownerId: null` leaves it unowned. */
export async function updateActionItem(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  itemId: Id<"retroActionItems">,
  patch: { text?: string; done?: boolean; ownerId?: Id<"users"> | null }
): Promise<void> {
  const item = await actionItemInRoom(ctx, room._id, itemId);
  if (patch.ownerId) await requireOwnerInRoom(ctx, room._id, patch.ownerId);
  const { ownerId: currentOwner, ...rest } = item;
  const ownerId = patch.ownerId === undefined ? currentOwner : (patch.ownerId ?? undefined);
  await ctx.db.replace(item._id, {
    ...rest,
    ...(patch.text !== undefined ? { text: validateActionText(patch.text) } : {}),
    ...(patch.done !== undefined ? { done: patch.done } : {}),
    ...(ownerId ? { ownerId } : {}),
  });
  await updateRoomActivity(ctx, room);
}

export async function deleteActionItem(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  itemId: Id<"retroActionItems">
): Promise<void> {
  const item = await actionItemInRoom(ctx, room._id, itemId);
  await ctx.db.delete(item._id);
  await updateRoomActivity(ctx, room);
}

// --- Deletion --------------------------------------------------------------------

/** Deletes the whole retro through the room cascade. */
export async function deleteRetro(ctx: MutationCtx, room: Doc<"rooms">): Promise<void> {
  retroOf(room);
  await ctx.scheduler.runAfter(0, internal.maintenance.deleteRoomAggregateChunk, { roomId: room._id });
}
