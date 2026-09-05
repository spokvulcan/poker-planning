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
import type { EditKeyStore } from "./use-edit-keys";

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

/** Who is writing: their id, and in an anonymous retro the keys this browser holds (ADR-0012). */
export interface CardWriter {
  userId: Id<"users">;
  anonymous: boolean;
  editKeys: EditKeyStore;
}

/**
 * The card writes (ADR-0022, spec §10.6 to §10.8): each mutation carries its
 * optimistic function, moves and text edits are keyed single-flight, and a
 * failure is retried with backoff while a refusal drops the value at once
 * and toasts its reason. In an anonymous retro a create's returned key is
 * remembered, and every edit, move and delete of a keyed card presents it
 * (ADR-0012); a named retro never sends one.
 */
export function useCardActions(roomId: Id<"rooms">, writer: CardWriter): CardActions {
  const { userId, anonymous, editKeys } = writer;
  const createCard = useMutation(api.retro.createCard);
  const moveCards = useMutation(api.retro.moveCards);
  const updateCard = useMutation(api.retro.updateCard);
  const deleteCard = useMutation(api.retro.deleteCard);

  const optimisticCreate = useMemo(
    () =>
      createCard.withOptimisticUpdate((store, args) => applyCreate(store, args, { userId, anonymous })),
    [createCard, userId, anonymous]
  );
  const optimisticMove = useMemo(() => moveCards.withOptimisticUpdate(applyMove), [moveCards]);
  const optimisticUpdate = useMemo(() => updateCard.withOptimisticUpdate(applyTextEdit), [updateCard]);
  const optimisticDelete = useMemo(() => deleteCard.withOptimisticUpdate(applyDelete), [deleteCard]);

  const moveInFlight = useSingleFlightMutation(optimisticMove, moveKey);
  const updateInFlight = useSingleFlightMutation(optimisticUpdate, (args) => args.clientId);

  /** The `editKey` argument for a card: the key this browser holds, in an anonymous retro only. */
  const editKeyArg = useCallback(
    (clientId: string): { editKey?: string } => {
      const editKey = anonymous ? editKeys.keyOf(clientId) : undefined;
      return editKey === undefined ? {} : { editKey };
    },
    [anonymous, editKeys]
  );

  const create = useCallback<CardActions["create"]>(
    async (args) => {
      try {
        const result = await retryWrite(() => optimisticCreate({ roomId, ...args }));
        // The key comes back exactly once (ADR-0012); keep it before the
        // result lands, so `mine` presents it on its next read.
        if (result?.editKey) editKeys.remember(args.clientId, result.editKey);
        return true;
      } catch (error) {
        surface(error, CARD_ACT_FAILED);
        return false;
      }
    },
    [optimisticCreate, roomId, editKeys]
  );

  const move = useCallback<CardActions["move"]>(
    (moves) => {
      void retryWrite(() =>
        moveInFlight({ roomId, moves: moves.map((m) => ({ ...m, ...editKeyArg(m.clientId) })) })
      ).catch((error) => surface(error, CARD_ACT_FAILED));
    },
    [moveInFlight, roomId, editKeyArg]
  );

  const editText = useCallback<CardActions["editText"]>(
    async (clientId, text) => {
      try {
        await updateInFlight({ roomId, clientId, text, ...editKeyArg(clientId) });
      } catch (error) {
        // A refusal is final and says why; a failure waits for the next
        // keystroke or blur (the draft hook retries), so it is not toasted.
        const refusal = refusalOf(error);
        if (refusal) toast.error(refusal.message);
        throw error;
      }
    },
    [updateInFlight, roomId, editKeyArg]
  );

  const remove = useCallback<CardActions["remove"]>(
    (clientId) => {
      void retryWrite(() => optimisticDelete({ roomId, clientId, ...editKeyArg(clientId) }))
        .then(() => editKeys.forget(clientId))
        .catch((error) => surface(error, CARD_ACT_FAILED));
    },
    [optimisticDelete, roomId, editKeyArg, editKeys]
  );

  return useMemo(() => ({ create, move, editText, remove }), [create, move, editText, remove]);
}
