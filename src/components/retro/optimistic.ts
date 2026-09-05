import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BoardRead, FullCard, ProjectedCard } from "@/convex/model/retro";
import { currentStageOf } from "@/convex/model/retroFormats";

/**
 * Optimistic functions (ADR-0022, spec §10.7): one synchronous pure
 * function per optimistic card mutation, patching every cached instance of
 * the named query through `getAllQueries`, so argument variance never
 * matters. A move patches `retro.board` and `retro.mine`; a create inserts
 * into both (a silhouette or the full card by the current entry's reveal);
 * a text edit patches `retro.mine` and `retro.board` only where the board
 * already carries the text; a delete removes from both.
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
  moves: { clientId: string; position: { x: number; y: number } }[];
}

export interface UpdateCardArgs {
  roomId: Id<"rooms">;
  clientId: string;
  text: string;
}

export interface DeleteCardArgs {
  roomId: Id<"rooms">;
  clientId: string;
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

/** A create: the row as the server will write it, with a placeholder id until the result lands. */
export function applyCreate(
  store: OptimisticLocalStore,
  args: CreateCardArgs,
  viewer: { userId: Id<"users">; now?: number }
): void {
  const now = viewer.now ?? Date.now();
  const full: FullCard = {
    _id: `optimistic-${args.clientId}` as Id<"retroCards">,
    clientId: args.clientId,
    position: args.position,
    promptId: args.promptId,
    text: args.text,
    authorId: viewer.userId,
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
    const writers = board.writers.includes(viewer.userId)
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
