"use client";

import { useCallback, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

interface PendingPlayer {
  id: Id<"users">;
  name: string;
}

interface UseDeleteConfirmationProps {
  /** The canvas-actions delete primitive — deletes a note unconditionally. */
  deleteNote: (nodeId: string) => void;
  /** The canvas-actions remove primitive — removes a user unconditionally. */
  removeUser: (userId: Id<"users">) => void;
}

interface UseDeleteConfirmationReturn {
  pendingNote: string | null;
  pendingPlayer: PendingPlayer | null;
  requestDeleteNote: (nodeId: string, hasContent: boolean) => void;
  requestDeletePlayer: (
    userId: Id<"users">,
    name: string,
    isSelf: boolean,
  ) => void;
  confirmNote: () => void;
  confirmPlayer: () => void;
  dismissNote: () => void;
  dismissPlayer: () => void;
}

/**
 * The destructive-flow branching, isolated so it can be tested without rendering
 * the canvas (user stories 3/15/20). Built on the canvas-actions primitives:
 * an empty note is deleted immediately; a note with content opens a confirm
 * dialog; removing another player always confirms first; self-removal is a no-op.
 */
export function useDeleteConfirmation({
  deleteNote,
  removeUser,
}: UseDeleteConfirmationProps): UseDeleteConfirmationReturn {
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [pendingPlayer, setPendingPlayer] = useState<PendingPlayer | null>(null);

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

  const requestDeletePlayer = useCallback(
    (userId: Id<"users">, name: string, isSelf: boolean) => {
      if (isSelf) return;
      setPendingPlayer({ id: userId, name });
    },
    [],
  );

  const confirmNote = useCallback(() => {
    setPendingNote((current) => {
      if (current) deleteNote(current);
      return null;
    });
  }, [deleteNote]);

  const confirmPlayer = useCallback(() => {
    setPendingPlayer((current) => {
      if (current) removeUser(current.id);
      return null;
    });
  }, [removeUser]);

  const dismissNote = useCallback(() => setPendingNote(null), []);
  const dismissPlayer = useCallback(() => setPendingPlayer(null), []);

  return {
    pendingNote,
    pendingPlayer,
    requestDeleteNote,
    requestDeletePlayer,
    confirmNote,
    confirmPlayer,
    dismissNote,
    dismissPlayer,
  };
}
