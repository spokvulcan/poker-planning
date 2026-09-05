import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BoardCardRead, BoardRead, FullCard, ProjectedCard } from "@/convex/model/retro";
import type { TallyRead, TopicRef } from "@/convex/model/retroVotes";
import { currentStageOf } from "@/convex/model/retroFormats";
import { nextGroupName } from "@/convex/retroCopy";
import { topicKey } from "./dots";

/**
 * Optimistic functions (ADR-0022, spec §10.7): one synchronous pure
 * function per optimistic card mutation, patching every cached instance of
 * the named query through `getAllQueries`, so argument variance never
 * matters. A move patches `retro.board` and `retro.mine`; a create inserts
 * into both (a silhouette or the full card by the current entry's reveal);
 * a text edit patches `retro.mine` and `retro.board` only where the board
 * already carries the text; a delete removes from both. Group and ungroup
 * patch `clusterId` in `retro.board` only (spec §10.7); tidy is a move.
 */

export interface CreateCardArgs {
  roomId: Id<"rooms">;
  clientId: string;
  text: string;
  promptId: string;
  position: { x: number; y: number };
}

export interface MoveCardsArgs {
  roomId: Id<"rooms">;
  moves: { clientId: string; position: { x: number; y: number }; editKey?: string }[];
}

export interface UpdateCardArgs {
  roomId: Id<"rooms">;
  clientId: string;
  text: string;
  editKey?: string;
}

export interface DeleteCardArgs {
  roomId: Id<"rooms">;
  clientId: string;
  editKey?: string;
}

function patchBoard(store: OptimisticLocalStore, patch: (board: BoardRead) => BoardRead): void {
  for (const { args, value } of store.getAllQueries(api.retro.board)) {
    if (value === undefined) continue;
    store.setQuery(api.retro.board, args, patch(value));
  }
}

function patchMine(store: OptimisticLocalStore, patch: (mine: FullCard[]) => FullCard[]): void {
  for (const { args, value } of store.getAllQueries(api.retro.mine)) {
    if (value === undefined) continue;
    store.setQuery(api.retro.mine, args, patch(value));
  }
}

/**
 * A create: the row as the server will write it, with a placeholder id
 * until the result lands. In an anonymous retro the card carries no author
 * and the writer set stays empty, as the server's read will (ADR-0012).
 */
export function applyCreate(
  store: OptimisticLocalStore,
  args: CreateCardArgs,
  viewer: { userId: Id<"users">; anonymous?: boolean; now?: number }
): void {
  const now = viewer.now ?? Date.now();
  const full: FullCard = {
    _id: `optimistic-${args.clientId}` as Id<"retroCards">,
    clientId: args.clientId,
    position: args.position,
    promptId: args.promptId,
    text: args.text,
    ...(viewer.anonymous ? {} : { authorId: viewer.userId }),
    createdAt: now,
    updatedAt: now,
    committedAt: now,
  };
  patchBoard(store, (board) => {
    if (board.cards.some((card) => card.clientId === args.clientId)) return board;
    const hidden = currentStageOf(board.retro).cardsVisible === "hidden";
    const projected: ProjectedCard = hidden
      ? { _id: full._id, clientId: full.clientId, position: full.position, promptId: full.promptId }
      : full;
    // Written after a snapshot and outside its order: late until raised (spec §12.3).
    const card: BoardCardRead = board.walk ? { ...projected, late: true } : projected;
    const writers =
      viewer.anonymous || board.writers.includes(viewer.userId)
        ? board.writers
        : [...board.writers, viewer.userId];
    return { ...board, cards: [...board.cards, card], writers };
  });
  patchMine(store, (mine) =>
    mine.some((card) => card.clientId === args.clientId) ? mine : [...mine, full]
  );
}

export function applyMove(store: OptimisticLocalStore, args: MoveCardsArgs): void {
  const target = new Map(args.moves.map((move) => [move.clientId, move.position]));
  const move = <C extends ProjectedCard>(card: C): C => {
    const position = target.get(card.clientId);
    return position ? { ...card, position } : card;
  };
  patchBoard(store, (board) => ({ ...board, cards: board.cards.map(move) }));
}

export function applyTextEdit(store: OptimisticLocalStore, args: UpdateCardArgs): void {
  patchMine(store, (mine) =>
    mine.map((card) => (card.clientId === args.clientId ? { ...card, text: args.text } : card))
  );
  for (const { args: queryArgs, value } of store.getAllQueries(api.retro.board)) {
    if (value === undefined) continue;
    const index = value.cards.findIndex((card) => card.clientId === args.clientId);
    if (index === -1 || !("text" in value.cards[index])) continue;
    const cards = value.cards.slice();
    cards[index] = { ...value.cards[index], text: args.text };
    store.setQuery(api.retro.board, queryArgs, { ...value, cards });
  }
}

export function applyDelete(store: OptimisticLocalStore, args: DeleteCardArgs): void {
  patchBoard(store, (board) => ({
    ...board,
    cards: board.cards.filter((card) => card.clientId !== args.clientId),
  }));
  patchMine(store, (mine) => mine.filter((card) => card.clientId !== args.clientId));
}

export interface FormClusterArgs {
  roomId: Id<"rooms">;
  clientIds: string[];
}

export interface AddToClusterArgs {
  roomId: Id<"rooms">;
  clusterId: Id<"retroClusters">;
  clientIds: string[];
}

export interface UngroupArgs {
  roomId: Id<"rooms">;
  clientIds: string[];
}

/** Re-point the named cards; a cluster left empty keeps its row, as on the server. */
function repointBoard(board: BoardRead, clientIds: readonly string[], clusterId: Id<"retroClusters"> | undefined): BoardRead {
  const named = new Set(clientIds);
  const cards = board.cards.map((card): ProjectedCard => {
    if (!named.has(card.clientId)) return card;
    const { clusterId: _dropped, ...rest } = card;
    return clusterId === undefined ? rest : { ...rest, clusterId };
  });
  return { ...board, cards };
}

/**
 * A form: a placeholder row under the id the caller minted, named by the
 * server's own rule, and the members pointed at it. The server's id
 * replaces the placeholder when the result lands.
 */
export function applyFormCluster(store: OptimisticLocalStore, args: FormClusterArgs, placeholderId: string): void {
  const clusterId = placeholderId as Id<"retroClusters">;
  patchBoard(store, (board) => {
    const row: BoardRead["clusters"][number] = {
      _id: clusterId,
      _creationTime: Date.now(),
      roomId: args.roomId,
      name: nextGroupName(board.clusters),
      createdAt: Date.now(),
    };
    return repointBoard({ ...board, clusters: [...board.clusters, row] }, args.clientIds, clusterId);
  });
}

export function applyAddToCluster(store: OptimisticLocalStore, args: AddToClusterArgs): void {
  patchBoard(store, (board) => repointBoard(board, args.clientIds, args.clusterId));
}

export function applyUngroup(store: OptimisticLocalStore, args: UngroupArgs): void {
  patchBoard(store, (board) => repointBoard(board, args.clientIds, undefined));
}

export interface DotArgs {
  roomId: Id<"rooms">;
  target: TopicRef;
}

/**
 * The cluster a card target's dot also counts for (ADR-0016), read from
 * the cached board; undefined for a cluster target or a loose card.
 */
function clusterOfTarget(store: OptimisticLocalStore, target: TopicRef): Id<"retroClusters"> | undefined {
  if (target.kind !== "card") return undefined;
  for (const { value } of store.getAllQueries(api.retro.board)) {
    const card = value?.cards.find((candidate) => candidate._id === target.id);
    if (card?.clusterId !== undefined) return card.clusterId;
  }
  return undefined;
}

function patchTally(store: OptimisticLocalStore, patch: (tally: TallyRead) => TallyRead): void {
  for (const { args, value } of store.getAllQueries(api.retro.tally)) {
    if (value === undefined) continue;
    store.setQuery(api.retro.tally, args, patch(value));
  }
}

const shifted = (record: Record<string, number>, key: string, by: number): Record<string, number> => {
  const next = (record[key] ?? 0) + by;
  const { [key]: _dropped, ...rest } = record;
  return next > 0 ? { ...rest, [key]: next } : rest;
};

/** A dot placed or removed: own dots and the spend always, the aggregate only where it shows (spec §10.7). */
function applyDot(store: OptimisticLocalStore, args: DotArgs, by: 1 | -1): void {
  const key = topicKey(args.target);
  const clusterId = clusterOfTarget(store, args.target);
  patchTally(store, (tally) => {
    if (by === -1 && (tally.mine[key] ?? 0) === 0) return tally;
    let counts = tally.counts;
    if (tally.visible) {
      counts = shifted(counts, key, by);
      if (clusterId !== undefined) counts = shifted(counts, clusterId, by);
    }
    return { ...tally, counts, mine: shifted(tally.mine, key, by), spent: Math.max(0, tally.spent + by) };
  });
}

export function applyPlaceDot(store: OptimisticLocalStore, args: DotArgs): void {
  applyDot(store, args, 1);
}

export function applyRemoveDot(store: OptimisticLocalStore, args: DotArgs): void {
  applyDot(store, args, -1);
}
