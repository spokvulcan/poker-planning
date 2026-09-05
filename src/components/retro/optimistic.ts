import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BoardRead, FullCard, ProjectedCard } from "@/convex/model/retro";
import { currentStageOf } from "@/convex/model/retroFormats";
import { nextGroupName } from "@/convex/retroCopy";

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
    const card: ProjectedCard = hidden
      ? { _id: full._id, clientId: full.clientId, position: full.position, promptId: full.promptId }
      : full;
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

/**
 * Point the named cards at a cluster (or none) and drop any cluster this
 * change left empty — the server's own rule, no more: a row that was
 * already empty is the server's to remove.
 */
function repointBoard(board: BoardRead, clientIds: readonly string[], clusterId: Id<"retroClusters"> | undefined): BoardRead {
  const named = new Set(clientIds);
  const vacated = new Set<Id<"retroClusters">>();
  const cards = board.cards.map((card): ProjectedCard => {
    if (!named.has(card.clientId)) return card;
    if (card.clusterId !== undefined && card.clusterId !== clusterId) vacated.add(card.clusterId);
    const { clusterId: _dropped, ...rest } = card;
    return clusterId === undefined ? rest : { ...rest, clusterId };
  });
  if (vacated.size === 0) return { ...board, cards };
  const populated = new Set(cards.map((card) => card.clusterId));
  return { ...board, cards, clusters: board.clusters.filter((k) => !vacated.has(k._id) || populated.has(k._id)) };
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
