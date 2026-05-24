"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";

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
  updateNoteContent: (nodeId: string, content: string) => void;
  createNote: (issueId: Id<"issues">) => void;
  deleteNote: (nodeId: string) => void;
  /** Persists a node position. Debouncing stays at the call site. */
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
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
 * is one adapter rather than ten inline `isDemoMode` guards (user stories
 * 8/9/12/23). The single ref-backed stabilizer lives here too — the wrapper is
 * built once and always invokes the latest closure, so stability can never be
 * reintroduced by a caller.
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
  const updateNodePositionMutation = useMutation(api.canvas.updateNodePosition);
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
      try {
        await showCards({ roomId });
      } catch (error) {
        console.error("Failed to show cards:", error);
      }
    },
    reset: async () => {
      if (isDemo) return;
      try {
        await resetGame({ roomId });
      } catch (error) {
        console.error("Failed to reset game:", error);
      }
    },
    toggleAutoComplete: async () => {
      if (isDemo) return;
      try {
        await toggleAutoCompleteMutation({ roomId });
      } catch (error) {
        console.error("Failed to toggle auto-complete:", error);
      }
    },
    cancelAutoReveal: async () => {
      if (isDemo) return;
      try {
        await cancelAutoRevealCountdown({ roomId });
      } catch (error) {
        console.error("Failed to cancel auto-reveal:", error);
      }
    },
    selectCard: async (cardValue: string) => {
      if (isDemo || !currentUserId) return;
      // Snapshot the prior highlight so a failed write rolls back to it rather
      // than to `null` (which would flash "no selection" over an existing vote
      // until the next server tick re-applies it).
      const previous = selectedCardValue;
      setSelectedCardValue(cardValue);
      try {
        await pickCard({
          roomId,
          userId: currentUserId,
          cardLabel: cardValue,
          // parseFloat, not parseInt — fractional scale cards like "0.5" must
          // keep their value; parseInt("0.5") truncates to 0. Special cards
          // ("?", "☕") are non-numeric and intentionally fall back to 0.
          cardValue: parseFloat(cardValue) || 0,
        });
      } catch (error) {
        console.error("Failed to pick card:", error);
        setSelectedCardValue(previous);
      }
    },
    updateNoteContent: async (nodeId: string, content: string) => {
      if (isDemo || !currentUserId) return;
      try {
        await updateNoteContentMutation({ roomId, nodeId, content, userId: currentUserId });
      } catch (error) {
        console.error("Failed to update note content:", error);
      }
    },
    createNote: async (issueId: Id<"issues">) => {
      if (isDemo || !currentUserId) return;
      try {
        await createNoteMutation({ roomId, issueId, userId: currentUserId });
      } catch (error) {
        console.error("Failed to create note:", error);
      }
    },
    deleteNote: async (nodeId: string) => {
      if (isDemo || !currentUserId) return;
      try {
        await deleteNoteMutation({ roomId, nodeId, userId: currentUserId });
      } catch (error) {
        console.error("Failed to delete note:", error);
      }
    },
    updateNodePosition: async (nodeId: string, position: { x: number; y: number }) => {
      if (isDemo || !currentUserId) return;
      try {
        await updateNodePositionMutation({ roomId, nodeId, position, userId: currentUserId });
      } catch (error) {
        console.error("Failed to update node position:", error);
      }
    },
    removeUser: async (userId: Id<"users">) => {
      if (isDemo) return;
      try {
        await removeUserMutation({ userId, roomId });
      } catch (error) {
        console.error("Failed to remove user:", error);
      }
    },
  };

  // The single stabilizer. `useRef(impl)` seeds the latest-impl ref with the
  // first render's closures; the effect keeps it current on every subsequent
  // commit (this is the `advanced-event-handler-refs` pattern, chosen over
  // `useEffectEvent` because these methods are embedded into React Flow node
  // `data` and passed to child node components, which the lint rule forbids for
  // effect events). The wrapper itself is built once via a lazy `useState`
  // initializer and held in state — never read back from a ref during render —
  // so its methods keep a frozen identity for the canvas's lifetime while always
  // invoking the latest closure.
  const implRef = useRef(impl);
  // No dependency array is intentional: this runs after every commit so the ref
  // always points at the latest closures (the "latest ref" pattern), not a
  // forgotten dep list.
  useEffect(() => {
    implRef.current = impl;
  });

  const [stableActions] = useState<CanvasActions>(() => ({
    reveal: () => implRef.current.reveal(),
    reset: () => implRef.current.reset(),
    toggleAutoComplete: () => implRef.current.toggleAutoComplete(),
    cancelAutoReveal: () => implRef.current.cancelAutoReveal(),
    selectCard: (cardValue) => implRef.current.selectCard(cardValue),
    updateNoteContent: (nodeId, content) =>
      implRef.current.updateNoteContent(nodeId, content),
    createNote: (issueId) => implRef.current.createNote(issueId),
    deleteNote: (nodeId) => implRef.current.deleteNote(nodeId),
    updateNodePosition: (nodeId, position) =>
      implRef.current.updateNodePosition(nodeId, position),
    removeUser: (userId) => implRef.current.removeUser(userId),
  }));

  return stableActions;
}
