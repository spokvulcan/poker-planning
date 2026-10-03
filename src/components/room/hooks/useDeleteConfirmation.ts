"use client";

import { useCallback, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ResolvedDecision } from "@/convex/permissions";

interface PendingPlayer {
  id: Id<"users">;
  name: string;
}

/** One player a Delete asked to remove, with what the viewer may do to them. */
export interface PlayerRemovalRequest {
  id: Id<"users">;
  name: string;
  isSelf: boolean;
  removeDecision: ResolvedDecision;
}

interface UseDeleteConfirmationProps {
  /** The canvas-actions delete primitive — deletes a note unconditionally. */
  deleteNote: (nodeId: string) => void;
  /** The canvas-actions remove primitive — removes a user unconditionally. */
  removeUser: (userId: Id<"users">) => void;
}

interface UseDeleteConfirmationReturn {
  pendingNote: string | null;
  /** The players awaiting confirmation; empty when no dialog is open. */
  pendingPlayers: PendingPlayer[];
  requestDeleteNote: (nodeId: string, hasContent: boolean) => void;
  requestRemovePlayers: (players: PlayerRemovalRequest[]) => void;
  confirmNote: () => void;
  confirmPlayers: () => void;
  dismissNote: () => void;
  dismissPlayers: () => void;
}

const NO_PLAYERS: PendingPlayer[] = [];

/**
 * The destructive-flow branching, isolated so it can be tested without rendering
 * the canvas (user stories 3/15/20). Built on the canvas-actions primitives:
 * an empty note is deleted immediately; a note with content opens a confirm
 * dialog; removing other players always confirms first, once for everyone a
 * single Delete selected; self-removal is skipped.
 *
 * The player-removal gate consumes the full resolved decision (the same shape
 * every permission-gated control uses) and skips a player it denies, so the
 * canvas and the settings-panel roster never disagree about who can be removed.
 */
export function useDeleteConfirmation({
  deleteNote,
  removeUser,
}: UseDeleteConfirmationProps): UseDeleteConfirmationReturn {
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [pendingPlayers, setPendingPlayers] = useState<PendingPlayer[]>(NO_PLAYERS);

  const requestDeleteNote = useCallback(
    (nodeId: string, hasContent: boolean) => {
      if (hasContent) {
        setPendingNote(nodeId);
      } else {
        deleteNote(nodeId);
      }
    },
    [deleteNote],
  );

  const requestRemovePlayers = useCallback((players: PlayerRemovalRequest[]) => {
    const removable = players
      .filter((player) => !player.isSelf && player.removeDecision.allowed)
      .map(({ id, name }) => ({ id, name }));
    if (removable.length > 0) setPendingPlayers(removable);
  }, []);

  // State updaters must stay pure, so fire the mutation here (not inside a
  // setState updater) then clear the pending value.
  const confirmNote = useCallback(() => {
    if (pendingNote) deleteNote(pendingNote);
    setPendingNote(null);
  }, [pendingNote, deleteNote]);

  const confirmPlayers = useCallback(() => {
    for (const player of pendingPlayers) removeUser(player.id);
    setPendingPlayers(NO_PLAYERS);
  }, [pendingPlayers, removeUser]);

  const dismissNote = useCallback(() => setPendingNote(null), []);
  const dismissPlayers = useCallback(() => setPendingPlayers(NO_PLAYERS), []);

  return {
    pendingNote,
    pendingPlayers,
    requestDeleteNote,
    requestRemovePlayers,
    confirmNote,
    confirmPlayers,
    dismissNote,
    dismissPlayers,
  };
}
