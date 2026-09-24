"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionItemView, BoardView, RetroState, StickyView } from "@/convex/model/retro";
import { heirOf, rootOf, stepFocus, stepOnFocus } from "@/convex/retroRules";
import { topicOrder } from "./build-retro-nodes";
import { OPTIMISTIC_PREFIX } from "./optimistic";

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
  // This retro's cached queries, rewritten in place when they're loaded; a
  // patch that returns its input leaves the query alone.
  const patchBoard = (store: OptimisticLocalStore, patch: (board: BoardView) => BoardView) => {
    const board = store.getQuery(api.retro.board, { roomId });
    const next = board && patch(board);
    if (next && next !== board) store.setQuery(api.retro.board, { roomId }, next);
  };
  const patchRetro = (store: OptimisticLocalStore, patch: (retro: RetroState) => RetroState) => {
    const data = store.getQuery(api.rooms.get, { roomId });
    if (!data?.room.retro) return;
    store.setQuery(api.rooms.get, { roomId }, { ...data, room: { ...data.room, retro: patch(data.room.retro) } });
  };
  const patchItems = (store: OptimisticLocalStore, patch: (items: ActionItemView[]) => ActionItemView[]) => {
    const items = store.getQuery(api.retro.actionItems, { roomId });
    if (items) store.setQuery(api.retro.actionItems, { roomId }, patch(items));
  };

  const addSticky = useMutation(api.retro.addSticky).withOptimisticUpdate((store, args) => {
    patchBoard(store, (board) => ({
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
    patchBoard(store, (board) =>
      mapStickies(board, (s) => {
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
    patchBoard(store, (board) =>
      mapStickies(board, (s) => (moved.has(s._id) ? { ...s, position: moved.get(s._id)! } : s))
    );
  });

  const deleteSticky = useMutation(api.retro.deleteSticky).withOptimisticUpdate((store, args) => {
    patchBoard(store, (board) => {
      const gone = board.stickies.find((s) => s._id === args.stickyId);
      if (!gone) return board;
      const heir = heirOf(board.stickies.filter((s) => s.stackId === args.stickyId));
      return mapStickies(board, (s) => {
        if (s._id === args.stickyId) return null;
        if (heir && s._id === heir._id) {
          const { stackId: _root, ...rest } = s;
          return { ...rest, position: gone.position };
        }
        if (heir && s.stackId === args.stickyId) return { ...s, stackId: heir._id };
        return s;
      });
    });
  });

  const stackSticky = useMutation(api.retro.stackSticky).withOptimisticUpdate((store, args) => {
    patchBoard(store, (board) => {
      const onto = board.stickies.find((s) => s._id === args.ontoId);
      const target = onto && (rootOf(onto) as Id<"retroStickies">);
      if (!target || target === args.stickyId) return board;
      return mapStickies(board, (s) =>
        s._id === args.stickyId || s.stackId === args.stickyId ? { ...s, stackId: target } : s
      );
    });
  });

  const unstackSticky = useMutation(api.retro.unstackSticky).withOptimisticUpdate((store, args) => {
    patchBoard(store, (board) =>
      mapStickies(board, (s) => {
        if (s._id !== args.stickyId) return s;
        const { stackId: _root, ...rest } = s;
        return { ...rest, position: args.position, myVote: false };
      })
    );
  });

  const toggleVote = useMutation(api.retro.toggleVote).withOptimisticUpdate((store, args) => {
    const board = store.getQuery(api.retro.board, { roomId });
    if (!board) return;
    const sticky = board.stickies.find((s) => s._id === args.stickyId);
    const topic = sticky && board.stickies.find((s) => s._id === rootOf(sticky));
    if (!topic) return;
    const voting = !topic.myVote;
    const budget = store.getQuery(api.rooms.get, { roomId })?.room.retro?.votesPerPerson ?? Infinity;
    if (voting && board.myVotes >= budget) return;
    const delta = voting ? 1 : -1;
    store.setQuery(api.retro.board, { roomId }, {
      ...mapStickies(board, (s) => (s._id === topic._id ? { ...s, myVote: voting } : s)),
      myVotes: board.myVotes + delta,
    });
    const cast = store.getQuery(api.retro.votesCast, { roomId });
    if (cast !== undefined) store.setQuery(api.retro.votesCast, { roomId }, cast + delta);
  });

  const setStep = useMutation(api.retro.setStep).withOptimisticUpdate((store, args) => {
    patchRetro(store, (retro) => ({ ...retro, step: args.step }));
  });

  const stepDiscussion = useMutation(api.retro.stepDiscussion).withOptimisticUpdate((store, args) => {
    const board = store.getQuery(api.retro.board, { roomId });
    if (!board) return;
    patchRetro(store, (retro) => ({
      ...retro,
      focusStickyId: stepFocus(topicOrder(board, retro.columns), retro.focusStickyId, args.direction) as
        | Id<"retroStickies">
        | undefined,
    }));
  });

  const focusTopic = useMutation(api.retro.focusTopic).withOptimisticUpdate((store, args) => {
    const sticky = store.getQuery(api.retro.board, { roomId })?.stickies.find((s) => s._id === args.stickyId);
    if (!sticky) return;
    patchRetro(store, (retro) => ({
      ...retro,
      step: stepOnFocus(retro.step),
      focusStickyId: rootOf(sticky) as Id<"retroStickies">,
    }));
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
    // Nothing on the board changes: the heights are for the reveal.
    measureStickies: useMutation(api.retro.measureStickies),
  };
}
