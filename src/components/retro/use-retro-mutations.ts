"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionItemView, BoardView, RetroState } from "@/convex/model/retro";
import * as Topics from "@/convex/retroTopics";
import {
  spotlightStepChange,
  stepAllows,
  stepChange,
  stepped,
  stickyActAllowed,
  withSpotlight,
} from "@/convex/retroSteps";
import { useMoveCanvasNodes } from "@/components/whiteboard/use-move-canvas-nodes";
import {
  applyActionItemEdit,
  applyNewActionItem,
  applyNewSticky,
  applyStickyEdit,
  applyTopicChange,
  applyVoteToggle,
  applyWalk,
} from "./board-view";

/**
 * The retro's writes, each with the optimistic update that makes it land on
 * the board before the server answers: a new sticky appears where it was
 * written, a drop stays where it was dropped, a vote dot sticks at once, the
 * step and the spotlight move on the click. Each update reads this retro's
 * cached queries, asks board-view.ts what the write does to them (the rules
 * the server applies), and writes back only what changed; none is shown for
 * an act the step would refuse. Convex rolls an update back by itself if the
 * server refuses.
 */
export function useRetroMutations(roomId: Id<"rooms">, viewerId: Id<"users">) {
  const boardOf = (store: OptimisticLocalStore) => store.getQuery(api.retro.board, { roomId });
  const retroOf = (store: OptimisticLocalStore) => store.getQuery(api.rooms.get, { roomId })?.room.retro;
  const membersOf = (store: OptimisticLocalStore) => store.getQuery(api.rooms.get, { roomId })?.users ?? [];

  // This retro's cached queries, rewritten in place when they're loaded; a
  // patch that returns its input leaves the query alone.
  const patchBoard = (store: OptimisticLocalStore, patch: (board: BoardView) => BoardView) => {
    const board = boardOf(store);
    const next = board && patch(board);
    if (next && next !== board) store.setQuery(api.retro.board, { roomId }, next);
  };
  const patchRetro = (store: OptimisticLocalStore, patch: (retro: RetroState) => RetroState) => {
    const data = store.getQuery(api.rooms.get, { roomId });
    const retro = data?.room.retro;
    if (!data || !retro) return;
    const next = patch(retro);
    if (next !== retro) store.setQuery(api.rooms.get, { roomId }, { ...data, room: { ...data.room, retro: next } });
  };
  const patchItems = (store: OptimisticLocalStore, patch: (items: ActionItemView[]) => ActionItemView[]) => {
    const items = store.getQuery(api.retro.actionItems, { roomId });
    const next = items && patch(items);
    if (next && next !== items) store.setQuery(api.retro.actionItems, { roomId }, next);
  };

  /** A topic change on the board, and the spotlight after its topic. */
  const changeTopics = (store: OptimisticLocalStore, change: Topics.TopicChange<Id<"retroStickies">> | null) => {
    const step = retroOf(store)?.step;
    if (!change || !step) return;
    patchBoard(store, (board) => applyTopicChange(board, change, step));
    patchRetro(store, (retro) => withSpotlight(retro, Topics.followSpotlight(retro.focusStickyId, change)));
  };

  const addSticky = useMutation(api.retro.addSticky).withOptimisticUpdate((store, args) => {
    const retro = retroOf(store);
    if (!retro) return;
    const by = { viewerId, retro, members: membersOf(store) };
    patchBoard(store, (board) => applyNewSticky(board, { ...args, createdAt: Date.now() }, by));
  });

  const updateSticky = useMutation(api.retro.updateSticky).withOptimisticUpdate((store, args) => {
    patchBoard(store, (board) => applyStickyEdit(board, args));
  });

  const moveStickies = useMutation(api.retro.moveStickies).withOptimisticUpdate((store, args) => {
    const moved = new Map(args.moves.map((m) => [m.stickyId as string, m.position]));
    patchBoard(store, (board) => ({
      ...board,
      stickies: board.stickies.map((s) => (moved.has(s._id) ? { ...s, position: moved.get(s._id)! } : s)),
    }));
  });

  const deleteSticky = useMutation(api.retro.deleteSticky).withOptimisticUpdate((store, args) => {
    const board = boardOf(store);
    if (board) changeTopics(store, Topics.remove(board.stickies, args.stickyId));
  });

  const stackSticky = useMutation(api.retro.stackSticky).withOptimisticUpdate((store, args) => {
    const board = boardOf(store);
    const retro = retroOf(store);
    const sticky = board?.stickies.find((s) => s._id === args.stickyId);
    const onto = board?.stickies.find((s) => s._id === args.ontoId);
    if (!board || !retro || !sticky || !onto) return;
    if (!stickyActAllowed(retro.step, "stack", sticky.mine && onto.mine).allowed) return;
    changeTopics(store, Topics.stack(board.stickies, args.stickyId, args.ontoId));
  });

  const unstackSticky = useMutation(api.retro.unstackSticky).withOptimisticUpdate((store, args) => {
    const board = boardOf(store);
    const retro = retroOf(store);
    const sticky = board?.stickies.find((s) => s._id === args.stickyId);
    if (!board || !retro || !sticky) return;
    if (!stickyActAllowed(retro.step, "unstack", sticky.mine).allowed) return;
    changeTopics(store, Topics.unstack(board.stickies, args.stickyId, args.position));
  });

  const toggleVote = useMutation(api.retro.toggleVote).withOptimisticUpdate((store, args) => {
    const board = boardOf(store);
    const retro = retroOf(store);
    if (!board || !retro || !stepAllows(retro.step, "vote").allowed) return;
    const votesCast = store.getQuery(api.retro.votesCast, { roomId });
    const next = applyVoteToggle({ board, votesCast }, args.stickyId, retro.votesPerPerson);
    if (!next) return;
    store.setQuery(api.retro.board, { roomId }, next.board);
    if (next.votesCast !== undefined) store.setQuery(api.retro.votesCast, { roomId }, next.votesCast);
  });

  const setStep = useMutation(api.retro.setStep).withOptimisticUpdate((store, args) => {
    patchRetro(store, (retro) => stepped(retro, stepChange(retro.step, args.step)));
  });

  const stepDiscussion = useMutation(api.retro.stepDiscussion).withOptimisticUpdate((store, args) => {
    const board = boardOf(store);
    if (!board) return;
    patchRetro(store, (retro) =>
      stepAllows(retro.step, "walk").allowed ? applyWalk(retro, board, args.direction) : retro
    );
  });

  const focusTopic = useMutation(api.retro.focusTopic).withOptimisticUpdate((store, args) => {
    const sticky = boardOf(store)?.stickies.find((s) => s._id === args.stickyId);
    if (!sticky) return;
    patchRetro(store, (retro) =>
      stepAllows(retro.step, "spotlight").allowed
        ? stepped(retro, spotlightStepChange(retro.step), Topics.rootOf(sticky))
        : retro
    );
  });

  const addActionItem = useMutation(api.retro.addActionItem).withOptimisticUpdate((store, args) => {
    patchItems(store, (items) =>
      applyNewActionItem(items, { ...args, createdAt: Date.now(), key: crypto.randomUUID() }, membersOf(store))
    );
  });

  const updateActionItem = useMutation(api.retro.updateActionItem).withOptimisticUpdate((store, args) => {
    patchItems(store, (items) => applyActionItemEdit(items, args, membersOf(store)));
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
    moveNodes: useMoveCanvasNodes(),
    addActionItem,
    updateActionItem,
    deleteActionItem,
    startNext: useMutation(api.retro.startNext),
    updateColumn: useMutation(api.retro.updateColumn),
    // Nothing on the board changes: the heights are for the reveal.
    measureStickies: useMutation(api.retro.measureStickies),
  };
}
