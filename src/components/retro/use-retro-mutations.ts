"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionItemView, BoardView, StickyView } from "@/convex/model/retro";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import { discussionOrder, rootOf, stepFocus } from "@/convex/retroRules";
import { OPTIMISTIC_PREFIX } from "./optimistic";

function patchBoard(
  store: OptimisticLocalStore,
  roomId: Id<"rooms">,
  patch: (board: BoardView) => BoardView
): void {
  const board = store.getQuery(api.retro.board, { roomId });
  if (board) store.setQuery(api.retro.board, { roomId }, patch(board));
}

function patchRoom(
  store: OptimisticLocalStore,
  roomId: Id<"rooms">,
  patch: (data: RoomWithRelatedData) => RoomWithRelatedData
): void {
  const data = store.getQuery(api.rooms.get, { roomId });
  if (data) store.setQuery(api.rooms.get, { roomId }, patch(data));
}

/** Finds the room a sticky belongs to among the boards this client holds. */
function boardOfSticky(store: OptimisticLocalStore, stickyId: string) {
  for (const { args, value } of store.getAllQueries(api.retro.board)) {
    if (value?.stickies.some((s) => s._id === stickyId)) return { roomId: args.roomId, board: value };
  }
  return null;
}

function mapStickies(board: BoardView, fn: (s: StickyView) => StickyView | null): BoardView {
  return { ...board, stickies: board.stickies.map(fn).filter((s): s is StickyView => s !== null) };
}

/**
 * The retro's writes, each with the optimistic update that makes it land
 * on the board before the server answers: a new sticky appears where it
 * was written, a drop stays where it was dropped, a vote dot sticks at
 * once, the step and the spotlight move on the click. Convex rolls each
 * one back by itself if the server refuses.
 */
export function useRetroMutations(roomId: Id<"rooms">) {
  const addSticky = useMutation(api.retro.addSticky).withOptimisticUpdate((store, args) => {
    patchBoard(store, args.roomId, (board) => ({
      ...board,
      stickies: [
        ...board.stickies,
        {
          _id: `${OPTIMISTIC_PREFIX}${args.clientId}` as Id<"retroStickies">,
          clientId: args.clientId,
          columnId: args.columnId,
          position: args.position,
          createdAt: Date.now(),
          mine: true,
          hidden: false,
          text: args.text.trim(),
          ...(args.gif ? { gif: args.gif } : {}),
          myVote: false,
        },
      ],
    }));
  });

  const updateSticky = useMutation(api.retro.updateSticky).withOptimisticUpdate((store, args) => {
    const found = boardOfSticky(store, args.stickyId);
    if (!found) return;
    store.setQuery(
      api.retro.board,
      { roomId: found.roomId },
      mapStickies(found.board, (s) => {
        if (s._id !== args.stickyId) return s;
        const next: StickyView = { ...s };
        if (args.text !== undefined) next.text = args.text.trim();
        if (args.gif === null) delete next.gif;
        else if (args.gif !== undefined) next.gif = args.gif;
        if (args.columnId !== undefined) next.columnId = args.columnId;
        return next;
      })
    );
  });

  const moveStickies = useMutation(api.retro.moveStickies).withOptimisticUpdate((store, args) => {
    const moved = new Map(args.moves.map((m) => [m.stickyId as string, m.position]));
    patchBoard(store, args.roomId, (board) =>
      mapStickies(board, (s) => (moved.has(s._id) ? { ...s, position: moved.get(s._id)! } : s))
    );
  });

  const deleteSticky = useMutation(api.retro.deleteSticky).withOptimisticUpdate((store, args) => {
    const found = boardOfSticky(store, args.stickyId);
    if (!found) return;
    const gone = found.board.stickies.find((s) => s._id === args.stickyId)!;
    const children = found.board.stickies
      .filter((s) => s.stackId === args.stickyId)
      .sort((a, b) => a.createdAt - b.createdAt);
    const heir = children[0];
    store.setQuery(
      api.retro.board,
      { roomId: found.roomId },
      mapStickies(found.board, (s) => {
        if (s._id === args.stickyId) return null;
        if (heir && s._id === heir._id) {
          const { stackId: _root, ...rest } = s;
          return { ...rest, position: gone.position };
        }
        if (heir && s.stackId === args.stickyId) return { ...s, stackId: heir._id };
        return s;
      })
    );
  });

  const stackSticky = useMutation(api.retro.stackSticky).withOptimisticUpdate((store, args) => {
    const found = boardOfSticky(store, args.stickyId);
    if (!found) return;
    const onto = found.board.stickies.find((s) => s._id === args.ontoId);
    if (!onto) return;
    const target = rootOf(onto) as Id<"retroStickies">;
    if (target === args.stickyId) return;
    store.setQuery(
      api.retro.board,
      { roomId: found.roomId },
      mapStickies(found.board, (s) =>
        s._id === args.stickyId || s.stackId === args.stickyId ? { ...s, stackId: target } : s
      )
    );
  });

  const unstackSticky = useMutation(api.retro.unstackSticky).withOptimisticUpdate((store, args) => {
    const found = boardOfSticky(store, args.stickyId);
    if (!found) return;
    store.setQuery(
      api.retro.board,
      { roomId: found.roomId },
      mapStickies(found.board, (s) => {
        if (s._id !== args.stickyId) return s;
        const { stackId: _root, ...rest } = s;
        return { ...rest, position: args.position, myVote: false };
      })
    );
  });

  const toggleVote = useMutation(api.retro.toggleVote).withOptimisticUpdate((store, args) => {
    const found = boardOfSticky(store, args.stickyId);
    if (!found) return;
    const sticky = found.board.stickies.find((s) => s._id === args.stickyId)!;
    const topic = rootOf(sticky);
    const current = found.board.stickies.find((s) => s._id === topic);
    if (!current) return;
    const voting = !current.myVote;
    const data = store.getQuery(api.rooms.get, { roomId: found.roomId });
    const budget = data?.room.retro?.votesPerPerson ?? Infinity;
    if (voting && found.board.myVotes >= budget) return;
    const delta = voting ? 1 : -1;
    store.setQuery(api.retro.board, { roomId: found.roomId }, {
      ...mapStickies(found.board, (s) => (s._id === topic ? { ...s, myVote: voting } : s)),
      myVotes: found.board.myVotes + delta,
      votesCast: found.board.votesCast + delta,
    });
  });

  const setStep = useMutation(api.retro.setStep).withOptimisticUpdate((store, args) => {
    patchRoom(store, args.roomId, (data) =>
      data.room.retro ? { ...data, room: { ...data.room, retro: { ...data.room.retro, step: args.step } } } : data
    );
  });

  const stepDiscussion = useMutation(api.retro.stepDiscussion).withOptimisticUpdate((store, args) => {
    const board = store.getQuery(api.retro.board, { roomId: args.roomId });
    patchRoom(store, args.roomId, (data) => {
      const retro = data.room.retro;
      if (!retro || !board) return data;
      const totals = new Map(board.stickies.map((s) => [s._id as string, s.votes ?? 0]));
      const order = discussionOrder(board.stickies, totals, retro.columns);
      const focus = stepFocus(order, retro.focusStickyId, args.direction) as Id<"retroStickies"> | undefined;
      return { ...data, room: { ...data.room, retro: { ...retro, focusStickyId: focus } } };
    });
  });

  const focusTopic = useMutation(api.retro.focusTopic).withOptimisticUpdate((store, args) => {
    const board = store.getQuery(api.retro.board, { roomId: args.roomId });
    const sticky = board?.stickies.find((s) => s._id === args.stickyId);
    if (!sticky) return;
    patchRoom(store, args.roomId, (data) =>
      data.room.retro
        ? {
            ...data,
            room: {
              ...data.room,
              retro: {
                ...data.room.retro,
                step: data.room.retro.step === "done" ? "done" : "discuss",
                focusStickyId: rootOf(sticky) as Id<"retroStickies">,
              },
            },
          }
        : data
    );
  });

  const updateNodePosition = useMutation(api.canvas.updateNodePosition).withOptimisticUpdate((store, args) => {
    const nodes = store.getQuery(api.canvas.getCanvasNodes, { roomId: args.roomId });
    if (!nodes) return;
    store.setQuery(
      api.canvas.getCanvasNodes,
      { roomId: args.roomId },
      nodes.map((n) => (n.nodeId === args.nodeId ? { ...n, position: args.position } : n))
    );
  });

  const patchItems = (store: OptimisticLocalStore, patch: (items: ActionItemView[]) => ActionItemView[]) => {
    const items = store.getQuery(api.retro.actionItems, { roomId });
    if (items) store.setQuery(api.retro.actionItems, { roomId }, patch(items));
  };

  const addActionItem = useMutation(api.retro.addActionItem).withOptimisticUpdate((store, args) => {
    patchItems(store, (items) => [
      ...items,
      {
        _id: `${OPTIMISTIC_PREFIX}${crypto.randomUUID()}` as Id<"retroActionItems">,
        text: args.text.trim(),
        done: false,
        carriedOver: false,
        createdAt: Date.now(),
      },
    ]);
  });

  const updateActionItem = useMutation(api.retro.updateActionItem).withOptimisticUpdate((store, args) => {
    const data = store.getQuery(api.rooms.get, { roomId });
    patchItems(store, (items) =>
      items.map((item) => {
        if (item._id !== args.itemId) return item;
        const next: ActionItemView = { ...item };
        if (args.text !== undefined) next.text = args.text.trim();
        if (args.done !== undefined) next.done = args.done;
        if (args.ownerId === null) {
          delete next.ownerId;
          delete next.ownerName;
        } else if (args.ownerId !== undefined) {
          next.ownerId = args.ownerId;
          next.ownerName = data?.users.find((u) => u._id === args.ownerId)?.name;
        }
        return next;
      })
    );
  });

  const deleteActionItem = useMutation(api.retro.deleteActionItem).withOptimisticUpdate((store, args) => {
    patchItems(store, (items) => items.filter((item) => item._id !== args.itemId));
  });

  return {
    addSticky,
    updateSticky,
    moveStickies,
    deleteSticky,
    stackSticky,
    unstackSticky,
    toggleVote,
    setStep,
    stepDiscussion,
    focusTopic,
    updateNodePosition,
    addActionItem,
    updateActionItem,
    deleteActionItem,
    startNext: useMutation(api.retro.startNext),
    updateColumn: useMutation(api.retro.updateColumn),
  };
}

export type RetroMutations = ReturnType<typeof useRetroMutations>;
