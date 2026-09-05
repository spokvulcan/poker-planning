import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { DEFAULT_RETRO_PERMISSIONS, type JoinPolicy } from "../permissions";
import { validateRoomName, updateRoomActivity } from "./rooms";
import { deleteRoomAggregateChunk } from "./roomAggregate";
import { listTeamsForUser } from "./teams";
import {
  currentStageOf,
  findFormat,
  insertStage,
  isLockedKindEntry,
  isRetroTint,
  LOCKED_STAGE_KINDS,
  MAX_PROMPTS,
  MAX_STAGES,
  newPromptId,
  newStageEntry,
  orderStagesBy,
  reorderKeepsLocks,
  renumberPrompts,
  seedStages,
  stampFormat,
  type FormatPrompt,
  type StageEntry,
  type StageKind,
  type Visibility,
  type StampedFormat,
} from "./retroFormats";
import {
  ALREADY_KEPT_BY_TEAM,
  CARDS_STILL_ANSWER,
  FORMAT_NAME_REQUIRED,
  LAST_PROMPT,
  NAME_INVALID,
  NO_TEAM_GROUP,
  NOT_A_RETRO,
  NOT_CURRENT_STAGE,
  ONLY_OWNER_CAN_ADOPT,
  PROMPT_IDS_UNIQUE,
  PROMPT_LABEL_REQUIRED,
  PROMPT_NOT_FOUND,
  STAGE_CURRENT_LOCKED,
  STAGE_ENTRY_NOT_FOUND,
  STAGE_IDS_UNIQUE,
  STAGE_KIND_LOCKED,
  STAGE_ORDER_INVALID,
  STAGE_ORDER_LOCKED,
  TEAM_MEMBERS_NEEDS_TEAM,
  TIMEBOX_INVALID,
  TINT_OUTSIDE_PALETTE,
  TOO_MANY_PROMPTS,
  TOO_MANY_STAGES,
  UNKNOWN_FORMAT,
  VOTE_BUDGET_INVALID,
} from "../retroCopy";
import { refusal } from "./refusal";
import { hashEditKeys } from "./editKeys";
import { isLate, orderIds, projectWalk, snapshotOrder, votedEntryBefore, type WalkRead } from "./walk";

/**
 * The retro (ADR-0016): one room with its ceremony state in a `retros` row
 * beside it. This module holds creation, the board read, the Team's side of
 * a retro's life (adoption, claim, deletion) and the two listings; cards,
 * clusters, dots and the walk arrive with their own tickets.
 */

export interface CreateRetroArgs {
  name: string;
  ownerId: Id<"users">;
  /** A library format's name, stamped as shipped; `format` takes precedence. */
  formatName?: string;
  /**
   * The edited copy from the create form (ADR-0021): stamped as given,
   * under whatever name the creator left on it. The shipped constant is
   * never read for it.
   */
  format?: StampedFormat;
  /** The edited stage list; the standard seed when absent. */
  stages?: StageEntry[];
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
  const { format, stages } = resolveCreateShape(args);
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

  await ctx.db.insert("retros", {
    roomId,
    attribution: defaults?.attribution ?? "named",
    format,
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

/**
 * What creation stamps: the edited copy when the form sent one, else the
 * library entry by name; the edited stage list when sent, else the seed.
 * Both are validated as data — the shipped constant is never consulted for
 * an edited copy, so an edit there can never leak back into it.
 */
function resolveCreateShape(
  args: Pick<CreateRetroArgs, "formatName" | "format" | "stages" | "team">
): { format: StampedFormat; stages: StageEntry[] } {
  const hasTeam = args.team !== undefined;
  if (args.format) {
    // An edited copy without a stage list seeds as its base library entry
    // does (a Lean Coffee copy keeps its visible collect), else the standard.
    const base = findFormat(args.format.name);
    return {
      format: validateStampedFormat(args.format),
      stages: args.stages
        ? validateStageList(args.stages)
        : seedStages({ collectVisible: base?.collectVisible }, { hasTeam }),
    };
  }
  const library = args.formatName === undefined ? undefined : findFormat(args.formatName);
  if (!library) {
    throw refusal("missing", UNKNOWN_FORMAT);
  }
  return {
    format: stampFormat(library),
    stages: args.stages ? validateStageList(args.stages) : seedStages(library, { hasTeam }),
  };
}

/** A stamped format as data: a name, one to ten prompts with unique ids, labels and palette tints. */
export function validateStampedFormat(format: StampedFormat): StampedFormat {
  const name = format.name.trim();
  if (!name) {
    throw refusal("forbidden", FORMAT_NAME_REQUIRED);
  }
  if (format.prompts.length === 0) {
    throw refusal("forbidden", LAST_PROMPT);
  }
  if (format.prompts.length > MAX_PROMPTS) {
    throw refusal("forbidden", TOO_MANY_PROMPTS);
  }
  if (new Set(format.prompts.map((p) => p.id)).size !== format.prompts.length) {
    throw refusal("forbidden", PROMPT_IDS_UNIQUE);
  }
  const prompts = renumberPrompts(
    format.prompts.map((p) => {
      const prompt: FormatPrompt = {
        id: p.id,
        label: validatePromptLabel(p.label),
        color: validateTint(p.color),
        order: p.order,
      };
      const hint = p.hint?.trim();
      if (hint) prompt.hint = hint;
      return prompt;
    })
  );
  return { name, prompts };
}

/** A stage list as data: one to ten entries, unique ids, at least one collect and one discuss. */
export function validateStageList(stages: readonly StageEntry[]): StageEntry[] {
  if (stages.length > MAX_STAGES) {
    throw refusal("forbidden", TOO_MANY_STAGES);
  }
  if (new Set(stages.map((s) => s.id)).size !== stages.length) {
    throw refusal("forbidden", STAGE_IDS_UNIQUE);
  }
  for (const kind of LOCKED_STAGE_KINDS) {
    if (!stages.some((s) => s.kind === kind)) {
      throw refusal("forbidden", STAGE_KIND_LOCKED);
    }
  }
  for (const stage of stages) {
    if (stage.voteBudget !== undefined && (!Number.isInteger(stage.voteBudget) || stage.voteBudget <= 0)) {
      throw refusal("forbidden", VOTE_BUDGET_INVALID);
    }
    if (stage.timeboxMinutes !== undefined && (!Number.isInteger(stage.timeboxMinutes) || stage.timeboxMinutes <= 0)) {
      throw refusal("forbidden", TIMEBOX_INVALID);
    }
  }
  return stages.map((stage) => ({ ...stage }));
}

/** The retros row of a room, or null for a poker room. */
export async function getRetro(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Doc<"retros"> | null> {
  return ctx.db
    .query("retros")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .unique();
}

/** The retros row of a room, or a `missing` refusal for a poker room. */
export async function requireRetro(ctx: QueryCtx, roomId: Id<"rooms">): Promise<Doc<"retros">> {
  const retro = await getRetro(ctx, roomId);
  if (!retro) {
    throw refusal("missing", NOT_A_RETRO);
  }
  return retro;
}

// --- The projection and the board reads (ADR-0015, spec §8.3, §9) ---

/** A card as a reader may see it: position and tint only (ADR-0015). */
export interface Silhouette {
  _id: Id<"retroCards">;
  clientId: string;
  position: { x: number; y: number };
  promptId: string;
  clusterId?: Id<"retroClusters">;
}

/** A card in full; never the edit-key hash. `authorId` only in a named retro. */
export type FullCard = Silhouette & {
  text: string;
  authorId?: Id<"users">;
  createdAt: number;
  updatedAt: number;
  committedAt: number;
};

export type ProjectedCard = Silhouette | FullCard;

export type Attribution = Doc<"retros">["attribution"];

/**
 * What the projection reads from the retro: the shared pointer's reveal
 * policy (ADR-0015) and the attribution (ADR-0012). The attribution is
 * consulted so that between the ratchet's first batch and its last, a row
 * still carrying an author is never read as named.
 */
export interface ProjectionPolicy {
  cardsVisible: Visibility;
  attribution: Attribution;
}

/** The policy of a retro right now: its current entry's reveal and its attribution. */
export function policyOf(retro: Doc<"retros">): ProjectionPolicy {
  return { cardsVisible: currentStageOf(retro).cardsVisible, attribution: retro.attribution };
}

/**
 * Who is reading: a person — by id, and by the hashes of the edit keys they
 * present (ADR-0012) — or nobody in particular (the identity-free board).
 */
export type Reader = { userId: Id<"users">; editKeyHashes?: ReadonlySet<string> } | null;

function silhouetteOf(card: Doc<"retroCards">): Silhouette {
  return {
    _id: card._id,
    clientId: card.clientId,
    position: card.position,
    promptId: card.promptId,
    ...(card.clusterId !== undefined ? { clusterId: card.clusterId } : {}),
  };
}

function fullCardOf(card: Doc<"retroCards">, attribution: Attribution): FullCard {
  return {
    ...silhouetteOf(card),
    text: card.text,
    ...(attribution === "named" && card.authorId !== undefined ? { authorId: card.authorId } : {}),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    committedAt: card.committedAt,
  };
}

/** Own means the author in a named retro and a presented key in an anonymous one (ADR-0012). */
function isOwn(policy: ProjectionPolicy, reader: Reader, card: Doc<"retroCards">): boolean {
  if (reader === null) return false;
  if (policy.attribution === "named") {
    return card.authorId !== undefined && card.authorId === reader.userId;
  }
  return card.editKeyHash !== undefined && reader.editKeyHashes?.has(card.editKeyHash) === true;
}

/**
 * The one projection (ADR-0015): when the entry hides cards and the card is
 * not the reader's own, a silhouette; otherwise the card without its edit
 * key hash, and without its author in an anonymous retro. Pure. The policy
 * is always the shared pointer's (the caller reads it from the retros row,
 * never from a client argument); the reader is `null` for the
 * identity-free board, so its bytes are the same for every viewer, and a
 * person for `retro.mine` and the exports.
 */
export function projectCard(
  policy: ProjectionPolicy,
  reader: Reader,
  card: Doc<"retroCards">
): ProjectedCard {
  if (policy.cardsVisible === "hidden" && !isOwn(policy, reader, card)) {
    return silhouetteOf(card);
  }
  return fullCardOf(card, policy.attribution);
}

/** How many cards and clusters one board read carries; a retro never approaches it. */
export const MAX_BOARD_ROWS = 2000;

/**
 * A board card: the projection plus the late marker (spec §12.3), carried
 * only when set so a silhouette stays the same bytes for every viewer.
 */
export type BoardCardRead = ProjectedCard & { late?: true };

export interface BoardRead {
  retro: Doc<"retros">;
  clusters: Doc<"retroClusters">[];
  cards: BoardCardRead[];
  /** The walk as the board shows it (spec §12.3), once one has been snapshotted. */
  walk?: WalkRead;
  /**
   * Who has written at least one card, in a named retro (the roster's
   * "has written", ADR-0012); empty under `anonymous`, where the count is
   * the only signal.
   */
  writers: Id<"users">[];
}

/**
 * `retro.board` (spec §9): the retros row, every cluster and every card
 * through the projection with no owner exception, so one cached result
 * serves every viewer. The viewer's own hidden text comes only through
 * `mine`, and the client merges the two.
 */
export async function board(ctx: QueryCtx, roomId: Id<"rooms">): Promise<BoardRead> {
  const retro = await requireRetro(ctx, roomId);
  const policy = policyOf(retro);
  const [clusters, rows] = await Promise.all([
    ctx.db
      .query("retroClusters")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(MAX_BOARD_ROWS),
    ctx.db
      .query("retroCards")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(MAX_BOARD_ROWS),
  ]);
  const writers = new Set<Id<"users">>();
  if (retro.attribution === "named") {
    for (const row of rows) {
      if (row.authorId !== undefined) writers.add(row.authorId);
    }
  }
  const walk = retro.walk;
  const inOrder = walk ? orderIds(walk) : undefined;
  return {
    retro,
    clusters,
    cards: rows.map((row) => ({
      ...projectCard(policy, null, row),
      ...(walk && inOrder && isLate(walk, inOrder, row) ? { late: true as const } : {}),
    })),
    ...(walk ? { walk: projectWalk(walk, rows, clusters) } : {}),
    writers: [...writers],
  };
}

/** How many presented keys one `mine` read hashes; a browser never holds more cards than a board. */
const MAX_PRESENTED_KEYS = MAX_BOARD_ROWS;

/**
 * `retro.mine` (spec §9): the viewer's own cards, by `by_room_author` in a
 * named retro and by the presented edit keys — hashed and matched against
 * the room's rows — in an anonymous one, through the one projection with
 * the viewer as reader, so "own means full" is decided in `projectCard`,
 * not here. Keys are the capability: whoever presents one reads its card.
 */
export async function mine(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">,
  editKeys: readonly string[] = []
): Promise<FullCard[]> {
  const retro = await requireRetro(ctx, roomId);
  const policy = policyOf(retro);
  const { reader, rows } =
    policy.attribution === "named"
      ? await mineByAuthor(ctx, roomId, userId)
      : await mineByKeys(ctx, roomId, userId, editKeys);
  return rows.map((row) => {
    const card = projectCard(policy, reader, row);
    // Every row here is the reader's own, so the projection can only answer in full.
    if (!("text" in card)) throw new Error("retro.mine: own card projected as a silhouette");
    return card;
  });
}

async function mineByAuthor(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">
): Promise<{ reader: Reader; rows: Doc<"retroCards">[] }> {
  const rows = await ctx.db
    .query("retroCards")
    .withIndex("by_room_author", (q) => q.eq("roomId", roomId).eq("authorId", userId))
    .take(MAX_BOARD_ROWS);
  return { reader: { userId }, rows };
}

/**
 * The anonymous half: no index can answer "whose key is this", so the
 * room's cards are read whole (bounded) and matched against the hashes of
 * the presented keys. No keys, no read.
 */
async function mineByKeys(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  userId: Id<"users">,
  editKeys: readonly string[]
): Promise<{ reader: Reader; rows: Doc<"retroCards">[] }> {
  const editKeyHashes = await hashEditKeys(editKeys.slice(0, MAX_PRESENTED_KEYS));
  const reader: Reader = { userId, editKeyHashes };
  if (editKeyHashes.size === 0) return { reader, rows: [] };
  const all = await ctx.db
    .query("retroCards")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_BOARD_ROWS);
  return {
    reader,
    rows: all.filter((row) => row.editKeyHash !== undefined && editKeyHashes.has(row.editKeyHash)),
  };
}

// --- The ratchet (ADR-0012, spec §4.3) ---

/** How many cards one strip step touches; the rest continues by schedule (spec §4.3). */
export const STRIP_BATCH_SIZE = 500;

export interface StripStep {
  done: boolean;
  /** The creation time the next step starts after; meaningful only when not done. */
  after?: number;
}

/**
 * One bounded step of the ratchet's strip: the room's next batch of cards
 * in creation order, each author removed. Progress is by `_creationTime`
 * on `by_room`, resumed inclusively so rows sharing the boundary instant
 * are never skipped — re-reading an already stripped row is a no-op.
 * Never touches `editKeyHash`, never touches a voter, and never bumps the
 * activity clock — the pressing mutation did that once (spec §14).
 */
export async function stripCardAuthorsChunk(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  after?: number,
  batchSize: number = STRIP_BATCH_SIZE
): Promise<StripStep> {
  const rows = await ctx.db
    .query("retroCards")
    .withIndex("by_room", (q) =>
      after === undefined ? q.eq("roomId", roomId) : q.eq("roomId", roomId).gte("_creationTime", after)
    )
    .take(batchSize);
  for (const row of rows) {
    if (row.authorId !== undefined) {
      await ctx.db.patch(row._id, { authorId: undefined });
    }
  }
  if (rows.length < batchSize) {
    return { done: true };
  }
  return { done: false, after: rows[rows.length - 1]._creationTime };
}

/** Schedules the next strip step when one remains: the room-cascade continuation shape. */
export async function continueStrip(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  step: StripStep
): Promise<void> {
  if (step.done) return;
  await ctx.scheduler.runAfter(0, internal.maintenance.stripCardAuthorsChunk, {
    roomId,
    after: step.after,
  });
}

/**
 * `ratchet` (ADR-0012): the guard has decided the actor is the owner. Flips
 * the retro to `anonymous` and strips the first batch of authors in the
 * same mutation, so no read after this commit shows a named card — the
 * projection reads the flag, and the rest of the strip continues by
 * schedule in the room-cascade shape. Irreversible; a second press is a
 * no-op. Allowed on a retro at rest. Calls the activity chokepoint once;
 * the continuation never does.
 */
export async function ratchet(ctx: MutationCtx, room: Doc<"rooms">): Promise<void> {
  if (room.roomType !== "retro") {
    throw refusal("missing", NOT_A_RETRO);
  }
  const retro = await requireRetro(ctx, room._id);
  if (retro.attribution === "anonymous") {
    return;
  }
  await ctx.db.patch(retro._id, { attribution: "anonymous" });
  await continueStrip(ctx, room._id, await stripCardAuthorsChunk(ctx, room._id));
  await updateRoomActivity(ctx, room);
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
  args: { room: Doc<"rooms">; toStageId: string }
): Promise<void> {
  const retro = await requireRetro(ctx, args.room._id);
  const index = retro.stages.findIndex((stage) => stage.id === args.toStageId);
  if (index === -1) {
    throw refusal("missing", STAGE_ENTRY_NOT_FOUND);
  }
  const entry = retro.stages[index];
  const needsWalk = entry.kind === "discuss" && retro.walk?.stageEntryId !== entry.id;
  await ctx.db.patch(retro._id, {
    currentStageId: args.toStageId,
    currentStageEnteredAt: Date.now(),
    ...(needsWalk ? { walk: await snapshotWalk(ctx, retro, index) } : {}),
  });
  await updateRoomActivity(ctx, args.room);
}

/**
 * The walk snapshot (spec §12.1, ADR-0023): keyed to the entry, so
 * re-entry keeps it and a second `discuss` entry gets its own. The order's
 * scope is the nearest earlier vote-carrying entry with any dots; with
 * none, every topic in creation order. Here rather than beside the walk's
 * acts because it is `advance`'s own write; the rule itself is
 * `snapshotOrder`. Dots are bounded by the board's bound, which is also
 * the dots' (`MAX_VOTE_ROWS`), named here without importing the dots
 * module.
 */
async function snapshotWalk(
  ctx: MutationCtx,
  retro: Doc<"retros">,
  discussIndex: number
): Promise<NonNullable<Doc<"retros">["walk"]>> {
  const roomId = retro.roomId;
  const [cards, clusters] = await Promise.all([
    ctx.db
      .query("retroCards")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(MAX_BOARD_ROWS),
    ctx.db
      .query("retroClusters")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(MAX_BOARD_ROWS),
  ]);
  const votesOf = (stageEntryId: string) =>
    ctx.db
      .query("retroVotes")
      .withIndex("by_room_entry", (q) => q.eq("roomId", roomId).eq("stageEntryId", stageEntryId))
      .take(MAX_BOARD_ROWS);
  const voted = await votedEntryBefore(
    retro.stages,
    discussIndex,
    async (stageEntryId) => (await votesOf(stageEntryId)).length > 0
  );
  const votes = voted ? await votesOf(voted.id) : [];
  return {
    stageEntryId: retro.stages[discussIndex].id,
    snapshotAt: Date.now(),
    order: snapshotOrder(cards, clusters, votes),
    cursor: 0,
    covered: [],
  };
}

/**
 * Patch one entry of the stage list in place; the act on the current entry
 * that the two in-the-moment `stageFlow` mutations share. Refused with
 * `stage` when the id is not the shared pointer's: an act on another entry
 * is a structural edit and belongs to `retroSettings` (spec §23.1).
 */
async function patchCurrentStage(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; stageId: string },
  patch: (entry: StageEntry) => StageEntry
): Promise<void> {
  const retro = await requireRetro(ctx, args.room._id);
  if (args.stageId !== retro.currentStageId) {
    throw refusal("stage", NOT_CURRENT_STAGE);
  }
  await ctx.db.patch(retro._id, {
    stages: retro.stages.map((entry) => (entry.id === args.stageId ? patch(entry) : entry)),
  });
  await updateRoomActivity(ctx, args.room);
}

/**
 * The in-place reveal toggle (ADR-0015): flips the current entry's reveal
 * policy either way, covering "show the board without moving on" and "hide
 * it again". A `stageFlow` act; the projection follows on the next read.
 */
export async function setCardsVisible(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; stageId: string; value: Visibility }
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
  args: { room: Doc<"rooms">; stageId: string; minutes?: number }
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

// --- Settings (ADR-0021, spec §6.4) ---

/**
 * Rename the retro. The room's name rule is shared with poker; its plain
 * error becomes a `forbidden` refusal here so the retro client can tell a
 * rule from a transient failure (spec §4.5).
 */
export async function renameRetro(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; name: string }
): Promise<void> {
  let name: string;
  try {
    name = validateRoomName(args.name);
  } catch (error) {
    throw refusal("forbidden", error instanceof Error ? error.message : NAME_INVALID);
  }
  await ctx.db.patch(args.room._id, { name });
  await updateRoomActivity(ctx, args.room);
}

/**
 * The join policy (ADR-0013): `teamMembers` is offered only when a Team
 * keeps the retro, since nobody could satisfy it otherwise.
 */
export async function setJoinPolicy(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; joinPolicy: JoinPolicy }
): Promise<void> {
  if (args.joinPolicy === "teamMembers" && args.room.teamId === undefined) {
    throw refusal("forbidden", TEAM_MEMBERS_NEEDS_TEAM);
  }
  await ctx.db.patch(args.room._id, { joinPolicy: args.joinPolicy });
  await updateRoomActivity(ctx, args.room);
}

/** The advisory cards-due date (ADR-0020); undefined clears it. It closes nothing. */
export async function setCollectUntil(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; collectUntil?: number }
): Promise<void> {
  const retro = await requireRetro(ctx, args.room._id);
  await ctx.db.patch(retro._id, { collectUntil: args.collectUntil });
  await updateRoomActivity(ctx, args.room);
}

/** The label, trimmed, or a refusal when blank. */
function validatePromptLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    throw refusal("forbidden", PROMPT_LABEL_REQUIRED);
  }
  return trimmed;
}

function validateTint(color: string): string {
  if (!isRetroTint(color)) {
    throw refusal("forbidden", TINT_OUTSIDE_PALETTE);
  }
  return color;
}

/** Write the retro's prompts back, renumbered; the name is kept. */
async function writePrompts(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  retro: Doc<"retros">,
  prompts: readonly FormatPrompt[]
): Promise<void> {
  await ctx.db.patch(retro._id, {
    format: { ...retro.format, prompts: renumberPrompts(prompts) },
  });
  await updateRoomActivity(ctx, room);
}

export interface PromptEdit {
  label?: string;
  /** An empty string clears the hint. */
  hint?: string;
}

/**
 * Edit a prompt's label or hint at any stage (spec §6.4; the tint is a
 * create-form choice, §6.1). Renaming changes no card: a card stores the
 * prompt's id, never its label (ADR-0016).
 */
export async function updatePrompt(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; promptId: string } & PromptEdit
): Promise<void> {
  const retro = await requireRetro(ctx, args.room._id);
  const prompt = retro.format.prompts.find((p) => p.id === args.promptId);
  if (!prompt) {
    throw refusal("missing", PROMPT_NOT_FOUND);
  }
  const edited: FormatPrompt = { ...prompt };
  if (args.label !== undefined) edited.label = validatePromptLabel(args.label);
  if (args.hint !== undefined) {
    const hint = args.hint.trim();
    if (hint) edited.hint = hint;
    else delete edited.hint;
  }
  await writePrompts(
    ctx,
    args.room,
    retro,
    retro.format.prompts.map((p) => (p.id === prompt.id ? edited : p))
  );
}

/** Add a prompt at any stage, last in order, up to the cap. */
export async function addPrompt(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; label: string; hint?: string; color: string }
): Promise<string> {
  const retro = await requireRetro(ctx, args.room._id);
  if (retro.format.prompts.length >= MAX_PROMPTS) {
    throw refusal("forbidden", TOO_MANY_PROMPTS);
  }
  const prompt: FormatPrompt = {
    id: newPromptId(),
    label: validatePromptLabel(args.label),
    color: validateTint(args.color),
    order: retro.format.prompts.length,
  };
  const hint = args.hint?.trim();
  if (hint) prompt.hint = hint;
  await writePrompts(ctx, args.room, retro, [...retro.format.prompts, prompt]);
  return prompt.id;
}

/**
 * Remove a prompt only while no card answers it (spec §6.4): a card keeps
 * its prompt id for life, so removing an answered prompt would orphan it.
 * The check reads the card table through `by_room_prompt`. `forbidden`,
 * never `stage`: the rule is about cards, not the pointer.
 */
export async function removePrompt(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; promptId: string }
): Promise<void> {
  const retro = await requireRetro(ctx, args.room._id);
  if (!retro.format.prompts.some((p) => p.id === args.promptId)) {
    throw refusal("missing", PROMPT_NOT_FOUND);
  }
  if (retro.format.prompts.length <= 1) {
    throw refusal("forbidden", LAST_PROMPT);
  }
  const answered = await ctx.db
    .query("retroCards")
    .withIndex("by_room_prompt", (q) => q.eq("roomId", args.room._id).eq("promptId", args.promptId))
    .first();
  if (answered) {
    throw refusal("forbidden", CARDS_STILL_ANSWER);
  }
  await writePrompts(
    ctx,
    args.room,
    retro,
    retro.format.prompts.filter((p) => p.id !== args.promptId)
  );
}

/** Write the stage list back; the pointer is untouched. */
async function writeStages(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  retro: Doc<"retros">,
  stages: readonly StageEntry[]
): Promise<void> {
  await ctx.db.patch(retro._id, { stages: [...stages] });
  await updateRoomActivity(ctx, room);
}

/**
 * Add an entry of a kind with the seed's defaults, at `index` or at the
 * end, up to the cap. Any kind may repeat (a second vote is a second round
 * of dots); the existing entries are the same rows afterwards.
 */
export async function addStage(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; kind: StageKind; index?: number }
): Promise<string> {
  const retro = await requireRetro(ctx, args.room._id);
  if (retro.stages.length >= MAX_STAGES) {
    throw refusal("forbidden", TOO_MANY_STAGES);
  }
  const entry = newStageEntry(args.kind);
  await writeStages(ctx, args.room, retro, insertStage(retro.stages, entry, args.index));
  return entry.id;
}

/**
 * Remove an entry except `collect`, `discuss` and the current one (spec
 * §6.4): the two kinds because the write stage and the walk stay in every
 * retro (a second entry of either is free to go), the current one because
 * the ground under the shared pointer never moves.
 */
export async function removeStage(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; stageId: string }
): Promise<void> {
  const retro = await requireRetro(ctx, args.room._id);
  if (!retro.stages.some((stage) => stage.id === args.stageId)) {
    throw refusal("missing", STAGE_ENTRY_NOT_FOUND);
  }
  if (isLockedKindEntry(retro.stages, args.stageId)) {
    throw refusal("forbidden", STAGE_KIND_LOCKED);
  }
  if (args.stageId === retro.currentStageId) {
    throw refusal("forbidden", STAGE_CURRENT_LOCKED);
  }
  await writeStages(
    ctx,
    args.room,
    retro,
    retro.stages.filter((stage) => stage.id !== args.stageId)
  );
}

/**
 * Reorder the list (spec §6.4): a permutation in which the current entry
 * keeps its index and collect stays ahead of discuss; see
 * `reorderKeepsLocks`. Entries are re-listed, never rewritten.
 */
export async function reorderStages(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; stageIds: string[] }
): Promise<void> {
  const retro = await requireRetro(ctx, args.room._id);
  const check = reorderKeepsLocks(retro.stages, args.stageIds, retro.currentStageId);
  if (!check.ok) {
    throw refusal(
      "forbidden",
      check.reason === "not-a-permutation" ? STAGE_ORDER_INVALID : STAGE_ORDER_LOCKED
    );
  }
  await writeStages(ctx, args.room, retro, orderStagesBy(retro.stages, args.stageIds));
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
