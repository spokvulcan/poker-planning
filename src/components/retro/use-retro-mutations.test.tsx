/**
 * The retro's writes land on the board before the server answers. Convex is
 * faked as its local query cache, holding this retro's queries and another
 * room's board: each write's optimistic update reads the queries it needs,
 * asks board-view what the write does to them, and writes back only what
 * changed, so it patches the queries it names and nothing else, and nothing
 * at all for an act the step refuses.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { OptimisticLocalStore } from "convex/browser";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";

const convex = vi.hoisted(() => ({ store: undefined as unknown as OptimisticLocalStore }));

// The client: a write runs its optimistic update on the local cache at once, then goes to the server.
vi.mock("convex/react", () => ({
  useMutation: () => {
    const send = () => Promise.resolve(null);
    return Object.assign(send, {
      withOptimisticUpdate: (update: (store: OptimisticLocalStore, args: unknown) => void) => (args: unknown) => {
        update(convex.store, args);
        return send();
      },
    });
  },
}));

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionItemView, BoardView, RetroState, StickyView } from "@/convex/model/retro";
import { columnsFromTemplate } from "@/convex/retroTemplates";
import { isOptimistic } from "./board-view";
import { useRetroMutations } from "./use-retro-mutations";

type Query = FunctionReference<"query">;

const ROOM = "room-1" as Id<"rooms">;
const OTHER_ROOM = "room-2" as Id<"rooms">;
const ME = "user-me" as Id<"users">;
const ADA = "user-ada" as Id<"users">;
const MINE = "s-mine" as Id<"retroStickies">;
const ADAS = "s-adas" as Id<"retroStickies">;
const UNDER = "s-under" as Id<"retroStickies">;
const ITEM = "item-1" as Id<"retroActionItems">;

function sticky(_id: Id<"retroStickies">, createdAt: number, extra: Partial<StickyView> = {}): StickyView {
  return {
    _id,
    clientId: `client-${_id}`,
    columnId: "c1",
    position: { x: createdAt * 300, y: 0 },
    createdAt,
    mine: false,
    hidden: false,
    text: `Sticky ${_id}`,
    ...(extra.stackId ? {} : { myVote: false }),
    ...extra,
  };
}

/**
 * Convex's local cache as this browser holds it: the retro (at the step
 * `retro` says) on `rooms.get`, its board, everyone's votes, its action items
 * and its canvas nodes, and another room's board. `patched` lists the queries
 * written, by name, and with their arguments when they aren't this retro's.
 */
function heldRetro(retro: Partial<RetroState> = {}) {
  const seeded: [Query, Record<string, unknown>, unknown][] = [
    [
      api.rooms.get,
      { roomId: ROOM },
      {
        room: {
          _id: ROOM,
          name: "Sprint 42 retro",
          roomType: "retro",
          retro: {
            step: "vote",
            columns: columnsFromTemplate("classic"),
            votesPerPerson: 3,
            showAuthors: false,
            ...retro,
          },
        },
        users: [
          { _id: ME, name: "Mo" },
          { _id: ADA, name: "Ada" },
        ],
        votes: [],
        isOwnerAbsent: false,
      },
    ],
    [
      api.retro.board,
      { roomId: ROOM },
      {
        stickies: [
          sticky(MINE, 1, { mine: true }),
          sticky(ADAS, 2, { myVote: true }),
          sticky(UNDER, 3, { stackId: ADAS }),
        ],
        writers: 2,
        myVotes: 1,
      } satisfies BoardView,
    ],
    [api.retro.votesCast, { roomId: ROOM }, 4],
    [
      api.retro.actionItems,
      { roomId: ROOM },
      [
        { _id: ITEM, text: "Timebox standups", done: false, carriedOver: false, createdAt: 1 },
      ] satisfies ActionItemView[],
    ],
    [
      api.canvas.getCanvasNodes,
      { roomId: ROOM },
      [{ roomId: ROOM, nodeId: "actions", type: "actions", data: {}, position: { x: 0, y: 0 } }],
    ],
    [api.retro.board, { roomId: OTHER_ROOM }, { stickies: [], writers: 0, myVotes: 0 } satisfies BoardView],
  ];
  const keyOf = (query: Query, args: Record<string, unknown>) => `${getFunctionName(query)} ${JSON.stringify(args)}`;
  const cache = new Map(seeded.map(([query, args, value]) => [keyOf(query, args), { query, args, value }]));
  const patched: string[] = [];
  convex.store = {
    getQuery: (query: Query, args: Record<string, unknown> = {}) => cache.get(keyOf(query, args))?.value,
    getAllQueries: (query: Query) =>
      [...cache.values()]
        .filter((entry) => getFunctionName(entry.query) === getFunctionName(query))
        .map(({ args, value }) => ({ args, value })),
    setQuery: (query: Query, args: Record<string, unknown>, value: unknown) => {
      cache.set(keyOf(query, args), { query, args, value });
      patched.push(keyOf(query, args) === keyOf(query, { roomId: ROOM }) ? getFunctionName(query) : keyOf(query, args));
    },
  } as unknown as OptimisticLocalStore;
  return {
    patched,
    read: <Q extends Query>(query: Q) => cache.get(keyOf(query, { roomId: ROOM }))?.value as FunctionReturnType<Q>,
  };
}

/** The viewer's handles on the retro's writes, as the board holds them. */
function writes() {
  return renderHook(() => useRetroMutations(ROOM, ME)).result.current;
}

type Writes = ReturnType<typeof useRetroMutations>;

describe("useRetroMutations", () => {
  const named: { write: string; retro?: Partial<RetroState>; send: (m: Writes) => unknown; patches: string[] }[] = [
    {
      write: "addSticky",
      send: (m) =>
        m.addSticky({
          roomId: ROOM,
          clientId: "draft-1",
          columnId: "c1",
          text: "Standups run long",
          position: { x: 0, y: 300 },
        }),
      patches: ["retro:board"],
    },
    {
      write: "updateSticky",
      send: (m) => m.updateSticky({ stickyId: MINE, text: "Standups run longer" }),
      patches: ["retro:board"],
    },
    {
      write: "moveStickies",
      send: (m) => m.moveStickies({ roomId: ROOM, moves: [{ stickyId: MINE, position: { x: 900, y: 0 } }] }),
      patches: ["retro:board"],
    },
    {
      write: "deleteSticky",
      retro: { step: "discuss", focusStickyId: MINE },
      send: (m) => m.deleteSticky({ stickyId: MINE }),
      patches: ["retro:board", "rooms:get"],
    },
    {
      write: "stackSticky",
      retro: { step: "discuss", focusStickyId: MINE },
      send: (m) => m.stackSticky({ stickyId: MINE, ontoId: ADAS }),
      patches: ["retro:board", "rooms:get"],
    },
    {
      write: "unstackSticky",
      retro: { step: "discuss" },
      send: (m) => m.unstackSticky({ stickyId: UNDER, position: { x: 1200, y: 0 } }),
      patches: ["retro:board"],
    },
    { write: "toggleVote", send: (m) => m.toggleVote({ stickyId: MINE }), patches: ["retro:board", "retro:votesCast"] },
    { write: "setStep", send: (m) => m.setStep({ roomId: ROOM, step: "discuss" }), patches: ["rooms:get"] },
    {
      write: "stepDiscussion",
      retro: { step: "discuss", focusStickyId: MINE },
      send: (m) => m.stepDiscussion({ roomId: ROOM, direction: "next" }),
      patches: ["rooms:get"],
    },
    { write: "focusTopic", send: (m) => m.focusTopic({ roomId: ROOM, stickyId: UNDER }), patches: ["rooms:get"] },
    {
      write: "addActionItem",
      send: (m) => m.addActionItem({ roomId: ROOM, text: "Pair on deploys" }),
      patches: ["retro:actionItems"],
    },
    {
      write: "updateActionItem",
      send: (m) => m.updateActionItem({ itemId: ITEM, done: true }),
      patches: ["retro:actionItems"],
    },
    { write: "deleteActionItem", send: (m) => m.deleteActionItem({ itemId: ITEM }), patches: ["retro:actionItems"] },
    {
      write: "moveNodes",
      send: (m) => m.moveNodes({ roomId: ROOM, moves: [{ nodeId: "actions", position: { x: 0, y: 900 } }] }),
      patches: ["canvas:getCanvasNodes"],
    },
  ];

  it.each(named)("$write patches $patches and nothing else", ({ retro, send, patches }) => {
    const held = heldRetro(retro);

    void send(writes());

    expect([...held.patched].sort()).toEqual([...patches].sort());
  });

  const refused: { refused: string; retro: Partial<RetroState>; send: (m: Writes) => unknown }[] = [
    { refused: "a vote outside Vote", retro: { step: "discuss" }, send: (m) => m.toggleVote({ stickyId: MINE }) },
    {
      refused: "stacking onto someone else's sticky before the reveal",
      retro: { step: "write" },
      send: (m) => m.stackSticky({ stickyId: MINE, ontoId: ADAS }),
    },
    {
      refused: "unstacking someone else's sticky before the reveal",
      retro: { step: "write" },
      send: (m) => m.unstackSticky({ stickyId: UNDER, position: { x: 1200, y: 0 } }),
    },
    {
      refused: "walking the topics outside Discuss",
      retro: { step: "vote" },
      send: (m) => m.stepDiscussion({ roomId: ROOM, direction: "next" }),
    },
    {
      refused: "a spotlight before the reveal",
      retro: { step: "write" },
      send: (m) => m.focusTopic({ roomId: ROOM, stickyId: ADAS }),
    },
  ];

  it.each(refused)("shows nothing for $refused", ({ retro, send }) => {
    const held = heldRetro(retro);

    void send(writes());

    expect(held.patched).toEqual([]);
  });

  it("draws the viewer's new sticky from the room it holds: the step, show authors and the names", () => {
    const held = heldRetro({ step: "discuss", showAuthors: true });

    void writes().addSticky({
      roomId: ROOM,
      clientId: "draft-1",
      columnId: "c2",
      text: " Standups run long ",
      position: { x: 10, y: 20 },
    });

    const added = held.read(api.retro.board).stickies.at(-1)!;
    expect(isOptimistic(added._id)).toBe(true);
    expect(added).toMatchObject({
      clientId: "draft-1",
      columnId: "c2",
      position: { x: 10, y: 20 },
      mine: true,
      hidden: false,
      text: "Standups run long",
      authorName: "Mo",
      myVote: false,
      votes: 0,
    });
  });

  it("shows an action item's owner the moment it is added", () => {
    const held = heldRetro();

    void writes().addActionItem({ roomId: ROOM, text: "Pair on deploys", ownerId: ADA });

    expect(held.read(api.retro.actionItems).at(-1)).toMatchObject({
      text: "Pair on deploys",
      ownerId: ADA,
      ownerName: "Ada",
      done: false,
    });
  });

  it("moves everyone's count with the viewer's vote", () => {
    const held = heldRetro();

    void writes().toggleVote({ stickyId: MINE });

    expect(held.read(api.retro.votesCast)).toBe(5);
    expect(held.read(api.retro.board).stickies.find((s) => s._id === MINE)?.myVote).toBe(true);
  });
});
