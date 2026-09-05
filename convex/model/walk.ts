import type { Doc, Id } from "../_generated/dataModel";
import type { StageEntry } from "./retroFormats";

/**
 * The discussion walk's arithmetic (spec §12, ADR-0023), pure over loaded
 * rows so a node test and the model layer share one rule. A topic is a
 * cluster with members or a loose card; a grouped card's topic is its
 * cluster. The order is snapshotted once on entering `discuss`; afterwards
 * only `raise` writes it, and everything else here is a projection.
 */

export type Walk = NonNullable<Doc<"retros">["walk"]>;

/** A card or a cluster, as the walk's order and a dot's target name one. */
export type TopicRef = Walk["order"][number];

type CardRow = Pick<Doc<"retroCards">, "_id" | "clusterId" | "createdAt" | "committedAt">;
type ClusterRow = Pick<Doc<"retroClusters">, "_id" | "createdAt">;
type VoteRow = Pick<Doc<"retroVotes">, "target">;

/** A card's topic: its cluster when grouped, itself when loose. */
export function topicOf(card: Pick<Doc<"retroCards">, "_id" | "clusterId">): TopicRef {
  return card.clusterId !== undefined ? { kind: "cluster", id: card.clusterId } : { kind: "card", id: card._id };
}

/** A topic's bare id, as `covered` stores it. */
export const topicId = (ref: TopicRef): string => ref.id;

export interface Topic {
  ref: TopicRef;
  createdAt: number;
}

/** Every live topic on the board: clusters with members, loose cards. */
export function liveTopics(cards: readonly CardRow[], clusters: readonly ClusterRow[]): Topic[] {
  const populated = new Set<Id<"retroClusters">>();
  const topics: Topic[] = [];
  for (const card of cards) {
    if (card.clusterId !== undefined) populated.add(card.clusterId);
    else topics.push({ ref: { kind: "card", id: card._id }, createdAt: card.createdAt });
  }
  for (const cluster of clusters) {
    if (populated.has(cluster._id)) topics.push({ ref: { kind: "cluster", id: cluster._id }, createdAt: cluster.createdAt });
  }
  return topics;
}

const byCreation = (a: Topic, b: Topic) => a.createdAt - b.createdAt;

/**
 * The snapshot's order (spec §12.1). `votes` are the rows of the nearest
 * earlier vote-carrying entry that has any dots, or empty when none ran:
 * with dots, the topics holding at least one — a dot on a member card
 * counting for its cluster (ADR-0016) — votes descending, ties by the
 * topic's creation; without, every topic in creation order.
 */
export function snapshotOrder(
  cards: readonly CardRow[],
  clusters: readonly ClusterRow[],
  votes: readonly VoteRow[]
): TopicRef[] {
  const topics = liveTopics(cards, clusters);
  if (votes.length === 0) return topics.sort(byCreation).map((topic) => topic.ref);
  const cardById = new Map(cards.map((card) => [card._id as string, card]));
  const counts = new Map<string, number>();
  for (const vote of votes) {
    const topic =
      vote.target.kind === "card"
        ? (() => {
            const card = cardById.get(vote.target.id);
            return card ? topicOf(card) : undefined;
          })()
        : vote.target;
    if (topic) counts.set(topic.id, (counts.get(topic.id) ?? 0) + 1);
  }
  return topics
    .filter((topic) => counts.has(topic.ref.id))
    .sort((a, b) => counts.get(b.ref.id)! - counts.get(a.ref.id)! || byCreation(a, b))
    .map((topic) => topic.ref);
}

/**
 * Which vote-carrying entry the snapshot reads (spec §12.1): the nearest
 * one before the `discuss` entry that has any dots. `hasDots` answers per
 * entry id; the walk is over the stage list, so the caller loads only the
 * entries this asks about.
 */
export async function votedEntryBefore(
  stages: readonly StageEntry[],
  discussIndex: number,
  hasDots: (stageEntryId: string) => Promise<boolean>
): Promise<StageEntry | undefined> {
  for (let i = discussIndex - 1; i >= 0; i--) {
    const entry = stages[i];
    if (entry.voteBudget === undefined) continue;
    if (await hasDots(entry.id)) return entry;
  }
  return undefined;
}

// --- The projection (spec §12.3) ---

export interface WalkEntry {
  /** The entry's index in the stored order, which the cursor and `setWalkCursor` use. */
  index: number;
  ref: TopicRef;
  covered: boolean;
}

/** A live topic the order does not hold: late when a card of it was written after the snapshot. */
export interface OutsideTopic {
  ref: TopicRef;
  late: boolean;
}

export interface WalkRead {
  stageEntryId: string;
  snapshotAt: number;
  cursor: number;
  /** The entries of the order still standing; a dangling ref (a dissolved cluster, a deleted card) is omitted. */
  entries: WalkEntry[];
  /** Coverage counts the walk only: ticked live entries over all live entries. */
  covered: number;
  total: number;
  /** How many topics outside the walk are late — "{n} new" in the readout. */
  late: number;
  /** Topics outside the walk, the late ones first, each group in creation order. */
  outside: OutsideTopic[];
}

/**
 * Which refs of the order still stand (spec §12.2): a card that exists,
 * grouped or not — a member's entry stays when a cluster forms mid-walk —
 * and a cluster that still has members. A dissolved cluster's ref dangles.
 */
function standingIds(walk: Pick<Walk, "order">, cards: readonly CardRow[], clusters: readonly ClusterRow[]): Set<string> {
  const populated = new Set<string>();
  const cardIds = new Set<string>();
  for (const card of cards) {
    cardIds.add(card._id);
    if (card.clusterId !== undefined) populated.add(card.clusterId);
  }
  const clusterIds = new Set(clusters.map((cluster) => cluster._id as string));
  return new Set(
    walk.order
      .map(topicId)
      .filter((id) => cardIds.has(id) || (clusterIds.has(id) && populated.has(id)))
  );
}

/** The ids of the order's refs, live or not. */
export function orderIds(walk: Pick<Walk, "order">): Set<string> {
  return new Set(walk.order.map(topicId));
}

/** A card is late when written after the snapshot and its topic is outside the order (spec §12.3). */
export function isLate(walk: Pick<Walk, "snapshotAt">, inOrder: ReadonlySet<string>, card: CardRow): boolean {
  return card.committedAt > walk.snapshotAt && !inOrder.has(topicId(topicOf(card)));
}

/** The walk as the board shows it, pure over the retro's rows. */
export function projectWalk(walk: Walk, cards: readonly CardRow[], clusters: readonly ClusterRow[]): WalkRead {
  const inOrder = orderIds(walk);
  const standing = standingIds(walk, cards, clusters);
  const coveredIds = new Set(walk.covered);
  const entries: WalkEntry[] = [];
  walk.order.forEach((ref, index) => {
    if (standing.has(topicId(ref))) entries.push({ index, ref, covered: coveredIds.has(topicId(ref)) });
  });
  const live = liveTopics(cards, clusters);
  const lateTopics = new Set<string>();
  for (const card of cards) {
    if (isLate(walk, inOrder, card)) lateTopics.add(topicId(topicOf(card)));
  }
  const outside = live
    .filter((topic) => !inOrder.has(topicId(topic.ref)))
    .map((topic) => ({ ref: topic.ref, late: lateTopics.has(topicId(topic.ref)), createdAt: topic.createdAt }))
    .sort((a, b) => Number(b.late) - Number(a.late) || a.createdAt - b.createdAt)
    .map(({ ref, late }) => ({ ref, late }));
  return {
    stageEntryId: walk.stageEntryId,
    snapshotAt: walk.snapshotAt,
    cursor: walk.cursor,
    entries,
    covered: entries.filter((entry) => entry.covered).length,
    total: entries.length,
    late: outside.filter((topic) => topic.late).length,
    outside,
  };
}
