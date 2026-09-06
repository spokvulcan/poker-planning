import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { updateRoomActivity } from "./rooms";
import { refusal } from "./refusal";
import type { CardActor } from "./retroCards";
import { MAX_BOARD_ROWS, requireRetro } from "./retro";
import { currentStageOf, type StageEntry } from "./retroFormats";
import {
  CARD_NOT_FOUND,
  CLUSTER_NOT_FOUND,
  DOT_NOT_FOUND,
  NO_VOTE_BUDGET,
  TOPIC_VOTES_CAPPED,
  VOTE_BUDGET_SPENT,
} from "../retroCopy";

/**
 * Dots (spec §11, ADR-0016): one row per dot on a topic — a cluster or a
 * loose card — scoped to the stage entry that collected it. The budget is
 * a count of the voter's rows for the entry, so stacking is free and a
 * second `vote` entry starts fresh. Any entry may carry a budget; the only
 * `stage` refusal is an entry without one, never a kind check (ADR-0010).
 */

export type TopicRef = Doc<"retroVotes">["target"];

/** How many dots one read carries; a retro never approaches it. */
export const MAX_VOTE_ROWS = MAX_BOARD_ROWS;

/** The tally's key for a topic: its row id. */
export const topicKey = (target: TopicRef): string => target.id;

/** The current entry, refused with `stage` when it carries no budget. */
async function requireVotingEntry(ctx: QueryCtx, roomId: Id<"rooms">): Promise<StageEntry> {
  const entry = currentStageOf(await requireRetro(ctx, roomId));
  if (entry.voteBudget === undefined) throw refusal("stage", NO_VOTE_BUDGET);
  return entry;
}

/** The target exists and belongs to the room, else `missing`. */
async function requireTopic(ctx: QueryCtx, roomId: Id<"rooms">, target: TopicRef): Promise<void> {
  if (target.kind === "card") {
    const card = await ctx.db.get(target.id);
    if (!card || card.roomId !== roomId) throw refusal("missing", CARD_NOT_FOUND);
  } else {
    const cluster = await ctx.db.get(target.id);
    if (!cluster || cluster.roomId !== roomId) throw refusal("missing", CLUSTER_NOT_FOUND);
  }
}

async function ownRows(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  stageEntryId: string,
  voterId: Id<"users">
): Promise<Doc<"retroVotes">[]> {
  return ctx.db
    .query("retroVotes")
    .withIndex("by_room_entry_voter", (q) => q.eq("roomId", roomId).eq("stageEntryId", stageEntryId).eq("voterId", voterId))
    .take(MAX_VOTE_ROWS);
}

const sameTopic = (a: TopicRef, b: TopicRef) => a.kind === b.kind && a.id === b.id;

/** Place one dot (everyone with a budget): refused `budget` at the entry's or the topic's cap. */
export async function placeDot(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; target: TopicRef }
): Promise<void> {
  const entry = await requireVotingEntry(ctx, args.room._id);
  await requireTopic(ctx, args.room._id, args.target);
  const rows = await ownRows(ctx, args.room._id, entry.id, args.actor.user._id);
  if (rows.length >= entry.voteBudget!) throw refusal("budget", VOTE_BUDGET_SPENT);
  if (entry.maxPerTopic !== undefined && rows.filter((row) => sameTopic(row.target, args.target)).length >= entry.maxPerTopic) {
    throw refusal("budget", TOPIC_VOTES_CAPPED);
  }
  await ctx.db.insert("retroVotes", {
    roomId: args.room._id,
    stageEntryId: entry.id,
    voterId: args.actor.user._id,
    target: args.target,
  });
  await updateRoomActivity(ctx, args.room);
}

/** Take one of the voter's own dots off a topic; none there is `missing`. */
export async function removeDot(
  ctx: MutationCtx,
  args: { room: Doc<"rooms">; actor: CardActor; target: TopicRef }
): Promise<void> {
  const entry = await requireVotingEntry(ctx, args.room._id);
  const rows = await ownRows(ctx, args.room._id, entry.id, args.actor.user._id);
  const row = rows.find((candidate) => sameTopic(candidate.target, args.target));
  if (!row) throw refusal("missing", DOT_NOT_FOUND);
  await ctx.db.delete(row._id);
  await updateRoomActivity(ctx, args.room);
}

export interface TallyRead {
  /** Which entry's dots these are. */
  stageEntryId: string;
  /** The current entry shows its tally; hidden on a `vote` entry by the seed. */
  visible: boolean;
  /** Dots per topic for everyone, empty while hidden; a cluster's is its own plus its members'. */
  counts: Record<string, number>;
  /** The viewer's own dots per topic, always. */
  mine: Record<string, number>;
  /** The viewer's rows on the entry. */
  spent: number;
  /** The current entry's budget and cap; absent when it takes no dots. */
  budget?: number;
  maxPerTopic?: number;
}

/**
 * The entry whose dots the board shows: the current one when it takes
 * dots, else the nearest earlier entry that did — the round a `discuss`
 * entry walks (spec §12.1) — else the current one, with nothing in it.
 */
export function tallyEntryOf(retro: { stages: readonly StageEntry[]; currentStageId: string }): StageEntry {
  const index = retro.stages.findIndex((stage) => stage.id === retro.currentStageId);
  for (let i = Math.max(index, 0); i >= 0; i--) {
    if (retro.stages[i].voteBudget !== undefined) return retro.stages[i];
  }
  return currentStageOf(retro);
}

/**
 * The one dot-count rule (spec §9, §15.3), pure over loaded rows: dots per
 * topic key, a dot on a member card carrying into its cluster's count
 * (ADR-0016). The tally and the export both count this way, and neither
 * lets a voter out.
 */
export function countDots(
  rows: readonly Pick<Doc<"retroVotes">, "target">[],
  cards: readonly Pick<Doc<"retroCards">, "_id" | "clusterId">[]
): Record<string, number> {
  const clusterOf = new Map<string, Id<"retroClusters">>();
  for (const card of cards) {
    if (card.clusterId !== undefined) clusterOf.set(card._id, card.clusterId);
  }
  const counts: Record<string, number> = {};
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  for (const row of rows) {
    bump(topicKey(row.target));
    const clusterId = row.target.kind === "card" ? clusterOf.get(row.target.id) : undefined;
    if (clusterId !== undefined) bump(clusterId);
  }
  return counts;
}

/**
 * `retro.tally` (spec §9, §8.2): per viewer and small. Counts are
 * aggregate and carry no voter in either attribution mode; the viewer's
 * own dots are theirs to see whatever the entry shows.
 */
export async function tally(ctx: QueryCtx, args: { roomId: Id<"rooms">; viewerId: Id<"users"> }): Promise<TallyRead> {
  const retro = await requireRetro(ctx, args.roomId);
  const current = currentStageOf(retro);
  const entry = tallyEntryOf(retro);
  const [rows, cards] = await Promise.all([
    ctx.db
      .query("retroVotes")
      .withIndex("by_room_entry", (q) => q.eq("roomId", args.roomId).eq("stageEntryId", entry.id))
      .take(MAX_VOTE_ROWS),
    ctx.db
      .query("retroCards")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_BOARD_ROWS),
  ]);
  const visible = current.tallyVisible === "visible";
  const mine: Record<string, number> = {};
  let spent = 0;
  for (const row of rows) {
    if (row.voterId !== args.viewerId) continue;
    spent += 1;
    const key = topicKey(row.target);
    mine[key] = (mine[key] ?? 0) + 1;
  }
  return {
    stageEntryId: entry.id,
    visible,
    counts: visible ? countDots(rows, cards) : {},
    mine,
    spent: current.id === entry.id ? spent : 0,
    ...(current.voteBudget !== undefined ? { budget: current.voteBudget } : {}),
    ...(current.maxPerTopic !== undefined ? { maxPerTopic: current.maxPerTopic } : {}),
  };
}

/** Every dot on a cluster, across entries. */
export async function dotsOnCluster(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  clusterId: Id<"retroClusters">
): Promise<Doc<"retroVotes">[]> {
  return ctx.db
    .query("retroVotes")
    .withIndex("by_room_target", (q) => q.eq("roomId", roomId).eq("target.id", clusterId))
    .take(MAX_VOTE_ROWS);
}
