"use client";

import { useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSingleFlightMutation } from "@/hooks/useSingleFlightMutation";
import { refusalOf, retryWrite } from "@/lib/write-retry";
import { toast } from "@/lib/toast";
import { CARD_ACT_FAILED } from "@/convex/retroCopy";
import { applyCreate, applyDelete, applyMove, applyTextEdit, type MoveCardsArgs } from "./optimistic";
import type { Move } from "./use-hand";

export interface CardActions {
  /** Resolves to whether the card was written; the same `clientId` rides every retry. */
  create: (args: { clientId: string; text: string; promptId: string; position: { x: number; y: number } }) => Promise<boolean>;
  /** One batch per gesture; fire and forget, the board settles by itself. */
  move: (moves: Move[]) => void;
  /** Rejects on failure so the draft keeps its "Unsaved" state (spec §10.8). */
  editText: (clientId: string, text: string) => Promise<void>;
  remove: (clientId: string) => void;
}

/** The refusal's reason, or the fallback for a failure that outlived its retries. */
function surface(error: unknown, fallback: string): void {
  toast.error(refusalOf(error)?.message || fallback);
}

/** The batch key: the sorted id set (ADR-0022). */
const moveKey = (args: MoveCardsArgs) => args.moves.map((m) => m.clientId).sort().join("\n");

/**
 * The card writes (ADR-0022, spec §10.6 to §10.8): each mutation carries its
 * optimistic function, moves and text edits are keyed single-flight, and a
 * failure is retried with backoff while a refusal drops the value at once
 * and toasts its reason.
 */
export function useCardActions(roomId: Id<"rooms">, userId: Id<"users">): CardActions {
  const createCard = useMutation(api.retro.createCard);
  const moveCards = useMutation(api.retro.moveCards);
  const updateCard = useMutation(api.retro.updateCard);
  const deleteCard = useMutation(api.retro.deleteCard);

  const optimisticCreate = useMemo(
    () =>
      createCard.withOptimisticUpdate((store, args) => applyCreate(store, args, { userId })),
    [createCard, userId]
  );
  const optimisticMove = useMemo(() => moveCards.withOptimisticUpdate(applyMove), [moveCards]);
  const optimisticUpdate = useMemo(() => updateCard.withOptimisticUpdate(applyTextEdit), [updateCard]);
  const optimisticDelete = useMemo(() => deleteCard.withOptimisticUpdate(applyDelete), [deleteCard]);

  const moveInFlight = useSingleFlightMutation(optimisticMove, moveKey);
  const updateInFlight = useSingleFlightMutation(optimisticUpdate, (args) => args.clientId);

  const create = useCallback<CardActions["create"]>(
    async (args) => {
      try {
        await retryWrite(() => optimisticCreate({ roomId, ...args }));
        return true;
      } catch (error) {
        surface(error, CARD_ACT_FAILED);
        return false;
      }
    },
    [optimisticCreate, roomId]
  );

  const move = useCallback<CardActions["move"]>(
    (moves) => {
      void retryWrite(() => moveInFlight({ roomId, moves })).catch((error) =>
        surface(error, CARD_ACT_FAILED)
      );
    },
    [moveInFlight, roomId]
  );

  const editText = useCallback<CardActions["editText"]>(
    async (clientId, text) => {
      try {
        await updateInFlight({ roomId, clientId, text });
      } catch (error) {
        // A refusal is final and says why; a failure waits for the next
        // keystroke or blur (the draft hook retries), so it is not toasted.
        const refusal = refusalOf(error);
        if (refusal) toast.error(refusal.message);
        throw error;
      }
    },
    [updateInFlight, roomId]
  );

  const remove = useCallback<CardActions["remove"]>(
    (clientId) => {
      void retryWrite(() => optimisticDelete({ roomId, clientId })).catch((error) =>
        surface(error, CARD_ACT_FAILED)
      );
    },
    [optimisticDelete, roomId]
  );

  return useMemo(() => ({ create, move, editText, remove }), [create, move, editText, remove]);
}
