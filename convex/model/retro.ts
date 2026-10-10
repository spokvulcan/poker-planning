import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { refusal } from "./refusal";
import { resolveRoomAction } from "./auth";
import { getMembership } from "./memberships";
import * as Canvas from "./canvas";
import { openRoom, updateRoomActivity } from "./rooms";
import { scheduleRoomDeletion } from "./roomAggregate";
import type { UserRows } from "./userRows";
import { ceremonyOf } from "../ceremony";
import { RESOLVED_ALLOWED } from "../permissions";
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
import * as Topics from "../retroTopics";
import {
  discussionOrder,
  spotlightStepChange,
  stepped,
  stepAllows,
  stepChange,
  stepShows,
  stickyActAllowed,
  stickyEditDecision,
  walk,
  withSpotlight,
  type RetroDecision,
  type StepChange,
} from "../retroSteps";
import { normalizeGifUrl } from "../gifLinks";
import { FACE_DOWN_HEIGHT, settleOnReveal, STICKY_MIN_HEIGHT } from "../retroLayout";
import type { Position } from "../canvasLayout";

export type RetroState = NonNullable<Doc<"rooms">["retro"]>;
export type Gif = NonNullable<Doc<"retroStickies">["gif"]>;

type StickyId = Id<"retroStickies">;

/** The retro state of a room, or a refusal when the room is not a retro. */
export function retroOf(room: Doc<"rooms">): RetroState {
  if (ceremonyOf(room) !== "retro" || !room.retro) {
    throw refusal("missing", "This is not a retro.");
  }
  return room.retro;
}

/** Throws a refused retro decision as the refusal the board shows. */
function requireAllowed(decision: RetroDecision): void {
  if (!decision.allowed) throw refusal(decision.code, decision.message);
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
 * Opens a retro: the room with its state, its board (the retro node, the
 * timer, one pad per column, the action items), and its owner seated in it.
 * A retro made by a permanent account is retained; a guest's expires with
 * the poker rooms.
 */
export async function createRetro(ctx: MutationCtx, args: CreateRetroArgs): Promise<Id<"rooms">> {
  return await openRoom(ctx, args.owner, {
    name: args.name,
    roomType: "retro",
    autoCompleteVoting: false,
    isGameOver: false,
    retro: {
      step: "write",
      columns: args.columns ?? columnsFromTemplate(args.templateId),
      votesPerPerson: args.votesPerPerson ?? DEFAULT_VOTES_PER_PERSON,
      showAuthors: args.showAuthors ?? false,
    },
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
  if (retro.nextRoomId && (await ctx.db.get("rooms", retro.nextRoomId))) {
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
        carriedOver: true,
        createdAt: now,
      })
    )
  );
  await ctx.db.patch("rooms", room._id, { retro: { ...retro, nextRoomId } });
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

async function myVotesOf(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  voterId: Id<"users">
): Promise<Doc<"retroStickyVotes">[]> {
  // One vote per topic at most, so the stickies cap bounds a person's votes too.
  return await ctx.db
    .query("retroStickyVotes")
    .withIndex("by_room_voter", (q) => q.eq("roomId", roomId).eq("voterId", voterId))
    .take(MAX_STICKIES_PER_ROOM);
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
  _id: StickyId;
  clientId: string;
  columnId: string;
  position: Position;
  stackId?: StickyId;
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
  /** How many topics the viewer has voted for (everyone's count is `countVotes`). */
  myVotes: number;
}

/**
 * The board as the viewer may see it (the server-side projection). Until the
 * totals show, it reads only the viewer's own votes, so a vote re-sends the
 * voter's board and nobody else's.
 */
export async function getBoard(
  ctx: QueryCtx,
  room: Doc<"rooms">,
  viewerId: Id<"users">
): Promise<BoardView> {
  const retro = retroOf(room);
  const { faceDown: hideOthers, totals: showTotals } = stepShows(retro.step);
  const [stickies, votes] = await Promise.all([
    stickiesOf(ctx, room._id),
    showTotals ? votesOf(ctx, room._id) : myVotesOf(ctx, room._id, viewerId),
  ]);

  const totals = Topics.voteTotals(stickies, votes);
  const myTopics = new Set(Topics.voteTotals(stickies, votes.filter((v) => v.voterId === viewerId)).keys());

  const authorNames = new Map<string, string>();
  if (retro.showAuthors && !hideOthers) {
    const authorIds = [...new Set(stickies.map((s) => s.authorId))];
    const authors = await Promise.all(authorIds.map((id) => ctx.db.get("users", id)));
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
    myVotes: myTopics.size,
  };
}

/**
 * How many votes everyone has cast, for the Vote step's progress. Every write
 * keeps one vote per person per topic (ADR-0028), so it reads only the votes:
 * a sticky moving mid-vote doesn't re-run it for everyone.
 */
export async function countVotes(ctx: QueryCtx, roomId: Id<"rooms">): Promise<number> {
  return (await votesOf(ctx, roomId)).length;
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
  const owners = await Promise.all(ownerIds.map((id) => ctx.db.get("users", id)));
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
  const rooms = await Promise.all(memberships.map((m) => ctx.db.get("rooms", m.roomId)));
  const retros = rooms
    .filter((room): room is Doc<"rooms"> & { retro: RetroState } => !!room && ceremonyOf(room) === "retro" && !!room.retro)
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

async function orderOf(ctx: QueryCtx, roomId: Id<"rooms">, columns: readonly RetroColumn[]): Promise<StickyId[]> {
  const [stickies, votes] = await Promise.all([stickiesOf(ctx, roomId), votesOf(ctx, roomId)]);
  return discussionOrder(stickies, Topics.voteTotals(stickies, votes), columns);
}

/**
 * Moves the retro between steps and puts the spotlight where the change
 * says (or on `spotlight`, when a person picked a topic). A change that is
 * the reveal also makes room on the board for the stickies that turn out
 * taller face-up (ADR-0027): no step change can leave Write without it.
 */
async function applyStepChange(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  retro: RetroState,
  change: StepChange | null,
  spotlight?: StickyId
): Promise<void> {
  let next = stepped(retro, change, spotlight);
  if (!spotlight && change?.spotlight === "first") {
    next = withSpotlight(next, (await orderOf(ctx, room._id, retro.columns))[0]);
  }
  await ctx.db.patch("rooms", room._id, { retro: next });
  if (change?.reveal) await settleRevealed(ctx, room._id);
  await updateRoomActivity(ctx, room);
}

/** Moves the retro to a step, forward or back. Nothing written is lost or locked. */
export async function setStep(ctx: MutationCtx, room: Doc<"rooms">, step: RetroStep): Promise<void> {
  const retro = retroOf(room);
  const change = stepChange(retro.step, step);
  if (change) await applyStepChange(ctx, room, retro, change);
}

/**
 * Keeps the reveal from leaving a sticky on top of another (ADR-0027): each
 * topic at the height its author's browser measured, or face-down size when
 * none did.
 */
async function settleRevealed(ctx: MutationCtx, roomId: Id<"rooms">): Promise<void> {
  const topics = (await stickiesOf(ctx, roomId)).filter((s) => s.stackId === undefined);
  const moves = settleOnReveal(
    topics.map((s) => ({ id: s._id, position: s.position, height: s.height ?? FACE_DOWN_HEIGHT }))
  );
  await Promise.all([...moves].map(([id, position]) => ctx.db.patch("retroStickies", id, { position })));
}

/** Moves the discussion one topic on or back. */
export async function stepDiscussion(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  direction: "next" | "previous"
): Promise<void> {
  const retro = retroOf(room);
  requireAllowed(stepAllows(retro.step, "walk"));
  const spotlight = walk(await orderOf(ctx, room._id, retro.columns), retro.focusStickyId, direction);
  await ctx.db.patch("rooms", room._id, { retro: withSpotlight(retro, spotlight) });
  await updateRoomActivity(ctx, room);
}

/** Puts one topic in the spotlight, voted for or not (a late sticky, say), moving the retro to the discussion. */
export async function focusTopic(ctx: MutationCtx, room: Doc<"rooms">, stickyId: StickyId): Promise<void> {
  const retro = retroOf(room);
  requireAllowed(stepAllows(retro.step, "spotlight"));
  const sticky = await stickyInRoom(ctx, room._id, stickyId);
  await applyStepChange(ctx, room, retro, spotlightStepChange(retro.step), Topics.rootOf(sticky));
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
  await ctx.db.patch("rooms", room._id, {
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
  await ctx.db.patch("rooms", room._id, { retro: { ...retro, columns } });
  await updateRoomActivity(ctx, room);
}

/** Adds a column; the canvas puts its pad one step right of the rightmost pad. */
export async function addColumn(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  column: { title: string; emoji: string; color: StickyColor }
): Promise<string> {
  const retro = retroOf(room);
  if (retro.columns.length >= MAX_COLUMNS) throw refusal("forbidden", `A retro has at most ${MAX_COLUMNS} columns.`);
  if (!STICKY_COLORS.includes(column.color)) throw refusal("forbidden", "Unknown colour.");
  const id = nextColumnId(retro.columns);
  await ctx.db.patch("rooms", room._id, {
    retro: {
      ...retro,
      columns: [...retro.columns, { id, title: validateColumnTitle(column.title), emoji: validateEmoji(column.emoji), color: column.color }],
    },
  });
  await Canvas.columnAdded(ctx, room._id, id);
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
  await ctx.db.patch("rooms", room._id, { retro: { ...retro, columns: retro.columns.filter((c) => c.id !== columnId) } });
  await Canvas.columnRemoved(ctx, room._id, columnId);
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

/** Taller than 500 lines of text under a GIF, so only a made-up height is cut. */
const MAX_STICKY_HEIGHT = 20_000;

function validateHeight(height: number): number {
  if (!Number.isFinite(height)) throw refusal("forbidden", "That sticky's size is malformed.");
  return Math.min(Math.max(Math.round(height), STICKY_MIN_HEIGHT), MAX_STICKY_HEIGHT);
}

async function stickyInRoom(ctx: QueryCtx, roomId: Id<"rooms">, stickyId: StickyId): Promise<Doc<"retroStickies">> {
  const sticky = await ctx.db.get("retroStickies", stickyId);
  if (!sticky || sticky.roomId !== roomId) throw refusal("missing", "That sticky is gone.");
  return sticky;
}

/**
 * Whether the actor may change what a sticky says or remove it: always their
 * own, someone else's once revealed and only under `cardManagement`.
 */
async function requireStickyEditor(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  retro: RetroState,
  sticky: Doc<"retroStickies">,
  membership: Doc<"roomMemberships">
): Promise<void> {
  const mine = sticky.authorId === membership.userId;
  const cardManagement = mine
    ? RESOLVED_ALLOWED
    : (await resolveRoomAction(ctx, membership, room, { kind: "category", category: "cardManagement" })).decision;
  requireAllowed(stickyEditDecision(retro.step, mine, cardManagement));
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
): Promise<StickyId> {
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
  const id = await ctx.db.insert("retroStickies", {
    roomId: room._id,
    clientId: args.clientId,
    columnId: args.columnId,
    text,
    ...(gif ? { gif } : {}),
    authorId: author._id,
    position: Canvas.validPosition(args.position),
    createdAt: Date.now(),
  });
  await updateRoomActivity(ctx, room);
  return id;
}

/** Rewrites a sticky's text or GIF (`gif: null` takes the GIF off). */
export async function updateSticky(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  membership: Doc<"roomMemberships">,
  sticky: Doc<"retroStickies">,
  patch: { text?: string; gif?: Gif | null; columnId?: string }
): Promise<void> {
  const retro = retroOf(room);
  await requireStickyEditor(ctx, room, retro, sticky, membership);
  const text = patch.text === undefined ? sticky.text : validateStickyText(patch.text);
  const gif = patch.gif === undefined ? sticky.gif : patch.gif === null ? undefined : validateGif(patch.gif);
  if (!text && !gif) throw refusal("forbidden", "A sticky needs words or a GIF.");
  if (patch.columnId !== undefined && !retro.columns.some((c) => c.id === patch.columnId)) {
    throw refusal("missing", "That column is gone.");
  }
  const { gif: _old, ...rest } = sticky;
  await ctx.db.replace("retroStickies", sticky._id, {
    ...rest,
    text,
    ...(gif ? { gif } : {}),
    ...(patch.columnId !== undefined ? { columnId: patch.columnId } : {}),
  });
  await updateRoomActivity(ctx, room);
}

/** Moves stickies. Anyone in the retro may move any sticky: it's a whiteboard. */
export async function moveStickies(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  moves: readonly { stickyId: StickyId; position: Position }[]
): Promise<void> {
  retroOf(room);
  if (moves.length > Canvas.MAX_MOVES) throw refusal("forbidden", "Too many stickies at once.");
  await Promise.all(
    moves.map(async (move) => {
      const sticky = await ctx.db.get("retroStickies", move.stickyId);
      // A sticky deleted mid-drag is simply skipped.
      if (!sticky || sticky.roomId !== room._id) return;
      await ctx.db.patch("retroStickies", sticky._id, { position: Canvas.validPosition(move.position) });
    })
  );
  await updateRoomActivity(ctx, room);
}

/**
 * Records how tall the author's browser draws their stickies face-up. While
 * writing, no other browser draws them face-up, so the author's is the only
 * one that can tell; nobody is ever sent it, and the reveal alone reads it
 * (ADR-0027). Anyone else's sticky is skipped, and so is a height that hasn't
 * changed, which writes nothing.
 */
export async function measureStickies(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  author: Doc<"users">,
  heights: readonly { stickyId: StickyId; height: number }[]
): Promise<void> {
  retroOf(room);
  if (heights.length > MAX_STICKIES_PER_ROOM) throw refusal("forbidden", "Too many stickies at once.");
  const changed = await Promise.all(
    heights.map(async ({ stickyId, height }) => {
      const sticky = await ctx.db.get("retroStickies", stickyId);
      if (!sticky || sticky.roomId !== room._id || sticky.authorId !== author._id) return false;
      const measured = validateHeight(height);
      if (sticky.height === measured) return false;
      await ctx.db.patch("retroStickies", sticky._id, { height: measured });
      return true;
    })
  );
  if (changed.includes(true)) await updateRoomActivity(ctx, room);
}

// --- Topics ----------------------------------------------------------------------

/**
 * The stickies of the topics `stickies` belong to: each sticky, its topic's
 * root, and every sticky stacked under that root. What a topic change reads.
 */
async function topicsAround(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  stickies: readonly Doc<"retroStickies">[]
): Promise<Doc<"retroStickies">[]> {
  const byId = new Map(stickies.map((s) => [s._id, s]));
  const topics = await Promise.all(
    [...new Set(stickies.map((s) => Topics.rootOf(s)))].map(async (root) => {
      const [top, members] = await Promise.all([
        byId.has(root) ? null : ctx.db.get("retroStickies", root),
        ctx.db
          .query("retroStickies")
          .withIndex("by_stack", (q) => q.eq("stackId", root))
          .take(MAX_STICKIES_PER_ROOM),
      ]);
      return top && top.roomId === roomId ? [top, ...members] : members;
    })
  );
  for (const sticky of topics.flat()) byId.set(sticky._id, sticky);
  return [...byId.values()];
}

/**
 * Writes a topic change (retroTopics): the stickies it moves or removes, the
 * votes that follow their topics (filed under the root, a duplicate given
 * back, a gone topic's refunded), and the spotlight after its topic.
 * `stickies` must be every sticky of the topics the change touches.
 */
async function applyTopicChange(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  retro: RetroState,
  stickies: readonly Doc<"retroStickies">[],
  change: Topics.TopicChange<StickyId>
): Promise<void> {
  const byId = new Map(stickies.map((s) => [s._id, s]));
  const votes = (
    await Promise.all(
      stickies.map((s) =>
        ctx.db
          .query("retroStickyVotes")
          .withIndex("by_sticky", (q) => q.eq("stickyId", s._id))
          .take(MAX_STICKIES_PER_ROOM)
      )
    )
  ).flat();
  const { refile, refund } = Topics.followVotes(
    votes,
    (vote) => {
      const sticky = byId.get(vote.stickyId);
      return sticky ? Topics.rootOf(sticky) : vote.stickyId;
    },
    change
  );

  await Promise.all([
    ...[...change.stickies.keys()].map((id) => {
      const sticky = byId.get(id);
      return sticky ? ctx.db.replace("retroStickies", id, Topics.patched(sticky, change)) : Promise.resolve();
    }),
    ...[...change.removed].map((id) => ctx.db.delete("retroStickies", id)),
    ...[...refund].map((id) => ctx.db.delete("retroStickyVotes", id)),
    ...[...refile].map(([id, stickyId]) => ctx.db.patch("retroStickyVotes", id, { stickyId })),
  ]);

  const spotlight = Topics.followSpotlight(retro.focusStickyId, change);
  if (spotlight !== retro.focusStickyId) {
    await ctx.db.patch("rooms", room._id, { retro: withSpotlight(retro, spotlight) });
  }
  await updateRoomActivity(ctx, room);
}

/**
 * Takes a sticky off the board. A stack keeps its other stickies, and its
 * oldest takes the top's place with the topic's votes and the spotlight; a
 * loose sticky's votes go back to their voters.
 */
export async function deleteSticky(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  membership: Doc<"roomMemberships">,
  sticky: Doc<"retroStickies">
): Promise<void> {
  const retro = retroOf(room);
  await requireStickyEditor(ctx, room, retro, sticky, membership);
  const around = await topicsAround(ctx, room._id, [sticky]);
  await applyTopicChange(ctx, room, retro, around, Topics.remove(around, sticky._id));
}

/**
 * Drops a sticky on another: its topic joins the other's, and a person who
 * voted for both keeps one vote (ADR-0028). While writing, a person stacks
 * only their own stickies: nobody groups what they cannot read.
 */
export async function stackSticky(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  user: Doc<"users">,
  sticky: Doc<"retroStickies">,
  ontoId: StickyId
): Promise<void> {
  const retro = retroOf(room);
  const onto = await stickyInRoom(ctx, room._id, ontoId);
  // Already one topic: nothing to refuse, or to read.
  if (Topics.rootOf(sticky) === Topics.rootOf(onto)) return;
  requireAllowed(stickyActAllowed(retro.step, "stack", sticky.authorId === user._id && onto.authorId === user._id));
  const around = await topicsAround(ctx, room._id, [sticky, onto]);
  const change = Topics.stack(around, sticky._id, onto._id);
  if (change) await applyTopicChange(ctx, room, retro, around, change);
}

/**
 * Takes a sticky off its stack and puts it down at `position`. The votes
 * stay with the stack. While writing, a person unstacks only their own.
 */
export async function unstackSticky(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  user: Doc<"users">,
  sticky: Doc<"retroStickies">,
  position: Position
): Promise<void> {
  const retro = retroOf(room);
  // Not in a stack: nothing to refuse, or to read.
  if (sticky.stackId === undefined) return;
  requireAllowed(stickyActAllowed(retro.step, "unstack", sticky.authorId === user._id));
  const around = await topicsAround(ctx, room._id, [sticky]);
  const change = Topics.unstack(around, sticky._id, Canvas.validPosition(position));
  if (change) await applyTopicChange(ctx, room, retro, around, change);
}

/** The voter's votes in a retro, each with the topic it counts for. */
async function votesWithTopics(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  voterId: Id<"users">
): Promise<{ _id: Id<"retroStickyVotes">; topic: StickyId }[]> {
  const votes = await myVotesOf(ctx, roomId, voterId);
  const stickies = await Promise.all(votes.map((vote) => ctx.db.get("retroStickies", vote.stickyId)));
  return votes.map((vote, i) => ({ _id: vote._id, topic: stickies[i] ? Topics.rootOf(stickies[i]) : vote.stickyId }));
}

/**
 * Votes for a topic, or takes the vote back: one vote per person per topic
 * (a stack is one topic), within the retro's budget, and only while the
 * retro is in `vote`.
 */
export async function toggleVote(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  voter: Doc<"users">,
  sticky: Doc<"retroStickies">
): Promise<void> {
  const retro = retroOf(room);
  requireAllowed(stepAllows(retro.step, "vote"));
  const outcome = Topics.toggleVote(
    Topics.rootOf(sticky),
    await votesWithTopics(ctx, room._id, voter._id),
    retro.votesPerPerson
  );
  switch (outcome.kind) {
    case "refused":
      throw refusal(outcome.code, outcome.message);
    case "takeBack":
      await Promise.all(outcome.votes.map((id) => ctx.db.delete("retroStickyVotes", id)));
      break;
    case "cast":
      await ctx.db.insert("retroStickyVotes", { roomId: room._id, stickyId: outcome.stickyId, voterId: voter._id });
      break;
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
    createdAt: Date.now(),
  });
  await updateRoomActivity(ctx, room);
  return id;
}

/** Edits an action item; `ownerId: null` leaves it unowned. */
export async function updateActionItem(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  item: Doc<"retroActionItems">,
  patch: { text?: string; done?: boolean; ownerId?: Id<"users"> | null }
): Promise<void> {
  if (patch.ownerId) await requireOwnerInRoom(ctx, room._id, patch.ownerId);
  const { ownerId: currentOwner, ...rest } = item;
  const ownerId = patch.ownerId === undefined ? currentOwner : (patch.ownerId ?? undefined);
  await ctx.db.replace("retroActionItems", item._id, {
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
  item: Doc<"retroActionItems">
): Promise<void> {
  await ctx.db.delete("retroActionItems", item._id);
  await updateRoomActivity(ctx, room);
}

// --- Deletion --------------------------------------------------------------------

/** Deletes the whole retro through the room cascade. */
export async function deleteRetro(ctx: MutationCtx, room: Doc<"rooms">): Promise<void> {
  retroOf(room);
  await scheduleRoomDeletion(ctx, room._id);
}

// --- Accounts --------------------------------------------------------------------

/** How many of one kind of retro row account linking moves; a guest never writes near this many. */
const MAX_LINKED_RETRO_ROWS = 5000;

/**
 * What retros keep about a person: the stickies they wrote, the votes they
 * cast, the action items they own. All three outlive the person's account:
 * the retro is the team's, and a gone author or owner shows as "Former
 * member" (the privacy page says so). A guest who signs in brings theirs to
 * the account, one vote per topic within each retro's budget (foldVotes).
 */
export const retroUserRows: UserRows = {
  fields: ["retroStickies.authorId", "retroStickyVotes.voterId", "retroActionItems.ownerId"],

  async forget() {},

  async fold(ctx, from, into) {
    const [stickies, votes, items] = await Promise.all([
      ctx.db.query("retroStickies").withIndex("by_author", (q) => q.eq("authorId", from)).take(MAX_LINKED_RETRO_ROWS),
      ctx.db.query("retroStickyVotes").withIndex("by_voter", (q) => q.eq("voterId", from)).take(MAX_LINKED_RETRO_ROWS),
      ctx.db.query("retroActionItems").withIndex("by_owner", (q) => q.eq("ownerId", from)).take(MAX_LINKED_RETRO_ROWS),
    ]);
    await Promise.all([
      ...stickies.map((sticky) => ctx.db.patch("retroStickies", sticky._id, { authorId: into })),
      ...items.map((item) => ctx.db.patch("retroActionItems", item._id, { ownerId: into })),
    ]);
    for (const roomId of new Set(votes.map((vote) => vote.roomId))) {
      const room = await ctx.db.get("rooms", roomId);
      const [accountVotes, guestVotes] = await Promise.all([
        votesWithTopics(ctx, roomId, into),
        votesWithTopics(ctx, roomId, from),
      ]);
      const { reassign, refund } = Topics.foldVotes(
        accountVotes,
        guestVotes,
        room?.retro?.votesPerPerson ?? DEFAULT_VOTES_PER_PERSON
      );
      await Promise.all([
        ...reassign.map((id) => ctx.db.patch("retroStickyVotes", id, { voterId: into })),
        ...refund.map((id) => ctx.db.delete("retroStickyVotes", id)),
      ]);
    }
  },
};
