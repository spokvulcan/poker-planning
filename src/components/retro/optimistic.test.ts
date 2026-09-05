/**
 * Optimistic functions (ADR-0022, spec §10.7): one synchronous pure function
 * per optimistic mutation, patching exactly the named queries through
 * `getAllQueries` and leaving every other cached query untouched. A create
 * in `collect` inserts a silhouette into `retro.board` and full text into
 * `retro.mine`; a text edit in `collect` never touches `retro.board`.
 */
import { describe, it, expect } from "vitest";
import type { OptimisticLocalStore } from "convex/browser";
import { getFunctionName, type FunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BoardRead, FullCard } from "@/convex/model/retro";
import { applyCreate, applyDelete, applyMove, applyTextEdit } from "./optimistic";

const roomId = "room-1" as Id<"rooms">;
const me = "u-me" as Id<"users">;
const other = "u-other" as Id<"users">;

/** A fake local store: values keyed by query name, one instance per args. */
function fakeStore(initial: Record<string, unknown>) {
  const values = new Map(Object.entries(initial));
  const writes: string[] = [];
  const nameOf = (ref: FunctionReference<"query">) => getFunctionName(ref).split(/[:.]/).pop()!;
  const store = {
    getQuery: (ref: FunctionReference<"query">) => values.get(nameOf(ref)),
    getAllQueries: (ref: FunctionReference<"query">) => {
      const value = values.get(nameOf(ref));
      return value === undefined ? [] : [{ args: { roomId }, value }];
    },
    setQuery: (ref: FunctionReference<"query">, _args: unknown, value: unknown) => {
      writes.push(nameOf(ref));
      values.set(nameOf(ref), value);
    },
  } as unknown as OptimisticLocalStore;
  return { store, writes, value: <T>(name: string) => values.get(name) as T };
}

function board(cardsVisible: "hidden" | "visible", cards: BoardRead["cards"] = []): BoardRead {
  return {
    retro: {
      currentStageId: "s1",
      stages: [{ id: "s1", kind: "collect", cardsVisible, tallyVisible: "visible" }],
      attribution: "named",
    } as unknown as BoardRead["retro"],
    clusters: [],
    cards,
    writers: [],
  };
}

const full = (clientId: string, authorId: Id<"users">, text = clientId): FullCard => ({
  _id: `id-${clientId}` as Id<"retroCards">,
  clientId,
  position: { x: 0, y: 0 },
  promptId: "p1",
  text,
  authorId,
  createdAt: 1,
  updatedAt: 1,
  committedAt: 1,
});

// `api.retro.board` names "retro:board"; the fake keys on the last segment.
const BOARD = getFunctionName(api.retro.board).split(/[:.]/).pop()!;
const MINE = getFunctionName(api.retro.mine).split(/[:.]/).pop()!;

describe("applyCreate", () => {
  it("in collect inserts a silhouette into board, the full card into mine, and names the writer", () => {
    const { store, writes, value } = fakeStore({ [BOARD]: board("hidden"), [MINE]: [], tally: {} });
    applyCreate(store, { roomId, clientId: "c1", text: "hi", promptId: "p1", position: { x: 3, y: 4 } }, { userId: me, now: 9 });

    expect(writes.sort()).toEqual([BOARD, MINE].sort());
    const [card] = value<BoardRead>(BOARD).cards;
    expect(card).toEqual({ _id: expect.any(String), clientId: "c1", position: { x: 3, y: 4 }, promptId: "p1" });
    expect(value<BoardRead>(BOARD).writers).toEqual([me]);
    expect(value<FullCard[]>(MINE)[0]).toMatchObject({ clientId: "c1", text: "hi", authorId: me, createdAt: 9 });
    expect(value("tally")).toEqual({});
  });

  it("in a visible entry inserts the full card into board", () => {
    const { store, value } = fakeStore({ [BOARD]: board("visible"), [MINE]: [] });
    applyCreate(store, { roomId, clientId: "c1", text: "hi", promptId: "p1", position: { x: 3, y: 4 } }, { userId: me, now: 9 });
    expect(value<BoardRead>(BOARD).cards[0]).toMatchObject({ clientId: "c1", text: "hi", authorId: me });
  });

  it("does nothing to a query that is not cached", () => {
    const { store, writes } = fakeStore({});
    applyCreate(store, { roomId, clientId: "c1", text: "hi", promptId: "p1", position: { x: 3, y: 4 } }, { userId: me, now: 9 });
    expect(writes).toEqual([]);
  });
});

describe("applyMove", () => {
  it("patches positions in board only, by clientId, and touches nothing else", () => {
    const { store, writes, value } = fakeStore({
      [BOARD]: board("visible", [full("a", me), full("b", other)]),
      [MINE]: [full("a", me)],
      tally: {},
    });
    applyMove(store, { roomId, moves: [{ clientId: "a", position: { x: 7, y: 8 } }, { clientId: "zz", position: { x: 1, y: 1 } }] });
    expect(writes).toEqual([BOARD]);
    expect(value<BoardRead>(BOARD).cards.map((c) => c.position)).toEqual([{ x: 7, y: 8 }, { x: 0, y: 0 }]);
  });
});

describe("applyTextEdit", () => {
  it("in collect patches mine and never touches board", () => {
    const silhouette = { _id: "id-a" as Id<"retroCards">, clientId: "a", position: { x: 0, y: 0 }, promptId: "p1" };
    const { store, writes, value } = fakeStore({ [BOARD]: board("hidden", [silhouette]), [MINE]: [full("a", me)] });
    applyTextEdit(store, { roomId, clientId: "a", text: "new" });
    expect(writes).toEqual([MINE]);
    expect(value<FullCard[]>(MINE)[0].text).toBe("new");
    expect(value<BoardRead>(BOARD).cards[0]).toEqual(silhouette);
  });

  it("in a visible entry patches both", () => {
    const { store, writes, value } = fakeStore({ [BOARD]: board("visible", [full("a", me)]), [MINE]: [full("a", me)] });
    applyTextEdit(store, { roomId, clientId: "a", text: "new" });
    expect(writes.sort()).toEqual([BOARD, MINE].sort());
    expect((value<BoardRead>(BOARD).cards[0] as FullCard).text).toBe("new");
  });
});

describe("applyDelete", () => {
  it("removes the card from board and mine", () => {
    const { store, value } = fakeStore({ [BOARD]: board("visible", [full("a", me), full("b", other)]), [MINE]: [full("a", me)] });
    applyDelete(store, { roomId, clientId: "a" });
    expect(value<BoardRead>(BOARD).cards.map((c) => c.clientId)).toEqual(["b"]);
    expect(value<FullCard[]>(MINE)).toEqual([]);
  });
});
