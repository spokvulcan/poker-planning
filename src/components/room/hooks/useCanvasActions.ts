"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";
import { useStableActions } from "@/hooks/useStableActions";
import { useMoveCanvasNodes } from "@/components/whiteboard/use-move-canvas-nodes";
import { runAct } from "@/lib/run-act";

// What a failed write shows when the server sent no refusal of its own.
const FAILED = "That didn't go through. Try again.";
const VOTE_FAILED = "That vote didn't count. Try again.";
const MOVE_FAILED = "That move didn't save.";
const NOTE_FAILED = "That note didn't save.";

/**
 * Every backend write the canvas can trigger, behind one frozen-identity object.
 * Each method keeps the same reference for the canvas's lifetime, so the
 * node-builder memo never churns and the render loop cannot recur (user stories
 * 10/11/13/18).
 */
export interface CanvasActions {
  reveal: () => void;
  reset: () => void;
  toggleAutoComplete: () => void;
  cancelAutoReveal: () => void;
  /** Sets the local highlight, writes the vote, rolls the highlight back on failure. */
  selectCard: (cardValue: string) => void;
  /** Resolves once the write has landed (or failed), so a note knows when its text is saved. */
  /** Resolves to whether the note's text landed, for the field to keep it until it has. */
  updateNoteContent: (nodeId: string, content: string) => Promise<boolean>;
  createNote: (issueId: Id<"issues">) => void;
  deleteNote: (nodeId: string) => void;
  /** Saves where a drop (or an arrow-key nudge) left nodes, in one write. */
  moveNodes: (moves: { nodeId: string; position: { x: number; y: number } }[]) => void;
  removeUser: (userId: Id<"users">) => void;
}

interface UseCanvasActionsProps {
  roomId: Id<"rooms">;
  currentUserId?: Id<"users">;
  /** The currently-highlighted card, so a failed pick can roll back to it. */
  selectedCardValue: string | null;
  setSelectedCardValue: (value: string | null) => void;
}

/**
 * Owns the demo-vs-real decision once, at the action seam: inside a demo context
 * every method is a no-op, so "the demo never writes to the backend" (ADR-0003)
 * is one adapter rather than an inline `isDemoMode` guard per method (user
 * stories 8/9/12/23). A write that fails says so through runAct, as the retro's
 * do: the refusal's message when the server refused it, else the board's own
 * words. Frozen method identity comes from useStableActions, the shared
 * stabilizer every *Actions seam returns through.
 */
export function useCanvasActions({
  roomId,
  currentUserId,
  selectedCardValue,
  setSelectedCardValue,
}: UseCanvasActionsProps): CanvasActions {
  // Reading the demo context here folds the action side of the `isDemoMode`
  // prop-drilling cleanup into this seam: a non-null context means demo mode.
  const isDemo = useDemoSimulation() !== null;

  const showCards = useMutation(api.rooms.showCards);
  const resetGame = useMutation(api.rooms.resetGame);
  const pickCard = useMutation(api.votes.pickCard);
  const moveNodesMutation = useMoveCanvasNodes();
  const toggleAutoCompleteMutation = useMutation(api.rooms.toggleAutoComplete);
  const cancelAutoRevealCountdown = useMutation(api.rooms.cancelAutoRevealCountdown);
  const updateNoteContentMutation = useMutation(api.canvas.updateNoteContent);
  const createNoteMutation = useMutation(api.canvas.createNote);
  const deleteNoteMutation = useMutation(api.canvas.deleteNote);
  const removeUserMutation = useMutation(api.users.remove);

  // The live implementations, recreated each render so they always close over
  // the latest roomId/currentUserId/mutations — no per-field refs needed.
  const impl: CanvasActions = {
    reveal: async () => {
      if (isDemo) return;
      await runAct(showCards({ roomId }), FAILED);
    },
    reset: async () => {
      if (isDemo) return;
      await runAct(resetGame({ roomId }), FAILED);
    },
    toggleAutoComplete: async () => {
      if (isDemo) return;
      await runAct(toggleAutoCompleteMutation({ roomId }), FAILED);
    },
    cancelAutoReveal: async () => {
      if (isDemo) return;
      await runAct(cancelAutoRevealCountdown({ roomId }), FAILED);
    },
    selectCard: async (cardValue: string) => {
      if (isDemo || !currentUserId) return;
      // Snapshot the prior highlight so a failed write rolls back to it rather
      // than to `null` (which would flash "no selection" over an existing vote
      // until the next server tick re-applies it).
      const previous = selectedCardValue ?? null;
      setSelectedCardValue(cardValue);
      const picked = await runAct(
        pickCard({
          roomId,
          userId: currentUserId,
          cardLabel: cardValue,
        }),
        VOTE_FAILED,
      );
      if (!picked) setSelectedCardValue(previous);
    },
    updateNoteContent: async (nodeId: string, content: string) => {
      if (isDemo || !currentUserId) return true;
      return await runAct(
        updateNoteContentMutation({ roomId, nodeId, content, userId: currentUserId }),
        NOTE_FAILED,
      );
    },
    createNote: async (issueId: Id<"issues">) => {
      if (isDemo || !currentUserId) return;
      await runAct(createNoteMutation({ roomId, issueId, userId: currentUserId }), FAILED);
    },
    deleteNote: async (nodeId: string) => {
      if (isDemo || !currentUserId) return;
      await runAct(deleteNoteMutation({ roomId, nodeId, userId: currentUserId }), FAILED);
    },
    moveNodes: async (moves) => {
      if (isDemo || !currentUserId || moves.length === 0) return;
      await runAct(moveNodesMutation({ roomId, moves, userId: currentUserId }), MOVE_FAILED);
    },
    removeUser: async (userId: Id<"users">) => {
      if (isDemo) return;
      await runAct(removeUserMutation({ userId, roomId }), FAILED);
    },
  };

  // Frozen identity comes from the one shared stabilizer (see useStableActions
  // for the full rationale): the returned wrapper is built once and always
  // invokes the latest closure.
  return useStableActions(impl);
}
