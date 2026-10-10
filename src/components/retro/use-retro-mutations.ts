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
import { stickyView, type Viewer } from "@/convex/retroStickyView";
import { useMoveCanvasNodes } from "@/components/whiteboard/use-move-canvas-nodes";
import { applyTopicChange, applyVoteToggle, applyWalk } from "./board-view";
import { OPTIMISTIC_PREFIX } from "./optimistic";

/**
 * The retro's writes, each with the optimistic update that makes it land on
 * the board before the server answers: a new sticky appears where it was
 * written, a drop stays where it was dropped, a vote dot sticks at once, the
 * step and the spotlight move on the click. Every update applies the same
 * topic and step rules the server does (board-view.ts), and none is shown for
 * an act the step would refuse. Convex rolls an update back by itself if the
 * server refuses.
 */
export function useRetroMutations(roomId: Id<"rooms">, viewerId: Id<"users">) {
  const boardOf = (store: OptimisticLocalStore) => store.getQuery(api.retro.board, { roomId });
  const retroOf = (store: OptimisticLocalStore) => store.getQuery(api.rooms.get, { roomId })?.room.retro;

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
    if (items) store.setQuery(api.retro.actionItems, { roomId }, patch(items));
  };

  /** A topic change on the board, and the spotlight after its topic. */
  const changeTopics = (store: OptimisticLocalStore, change: Topics.TopicChange<Id<"retroStickies">> | null) => {
    if (!change) return;
    patchBoard(store, (board) => applyTopicChange(board, change));
    patchRetro(store, (retro) => withSpotlight(retro, Topics.followSpotlight(retro.focusStickyId, change)));
  };

  // The viewer's new sticky, projected as the board read will send it back:
  // named once revealed while the retro shows authors, and no votes yet.
  const addSticky = useMutation(api.retro.addSticky).withOptimisticUpdate((store, args) => {
    const data = store.getQuery(api.rooms.get, { roomId });
    const retro = data?.room.retro;
    if (!data || !retro) return;
    const viewer: Viewer = {
      retro,
      viewerId,
      myTopics: new Set(),
      names: new Map(data.users.map((user) => [user._id, user.name])),
      totals: new Map(),
    };
    patchBoard(store, (board) => {
      const sticky = stickyView(
        {
          _id: `${OPTIMISTIC_PREFIX}${args.clientId}` as Id<"retroStickies">,
          clientId: args.clientId,
          columnId: args.columnId,
          position: args.position,
          createdAt: Date.now(),
          authorId: viewerId,
          text: args.text.trim(),
          ...(args.gif ? { gif: args.gif } : {}),
        },
        viewer
      );
      return { ...board, stickies: [...board.stickies, sticky] };
    });
  });

  const updateSticky = useMutation(api.retro.updateSticky).withOptimisticUpdate((store, args) => {
    patchBoard(store, (board) => ({
      ...board,
      stickies: board.stickies.map((s) => {
        if (s._id !== args.stickyId) return s;
        const { gif: current, ...rest } = s;
        const gif = args.gif === undefined ? current : (args.gif ?? undefined);
        return {
          ...rest,
          ...(args.text !== undefined ? { text: args.text.trim() } : {}),
          ...(gif ? { gif } : {}),
          ...(args.columnId !== undefined ? { columnId: args.columnId } : {}),
        };
      }),
    }));
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
    const next = applyVoteToggle(board, args.stickyId, retro.votesPerPerson);
    if (!next) return;
    store.setQuery(api.retro.board, { roomId }, next.board);
    const cast = store.getQuery(api.retro.votesCast, { roomId });
    if (cast !== undefined) store.setQuery(api.retro.votesCast, { roomId }, cast + next.cast);
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
        const { ownerId: currentOwner, ownerName: currentName, ...rest } = item;
        const owner =
          args.ownerId === undefined
            ? currentOwner && { ownerId: currentOwner, ownerName: currentName }
            : args.ownerId && { ownerId: args.ownerId, ownerName: data?.users.find((u) => u._id === args.ownerId)?.name };
        return {
          ...rest,
          ...(args.text !== undefined ? { text: args.text.trim() } : {}),
          ...(args.done !== undefined ? { done: args.done } : {}),
          ...(owner || {}),
        };
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
