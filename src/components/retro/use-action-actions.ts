"use client";

import { useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionStatus } from "@/convex/model/retroActions";
import type { TopicRef } from "@/convex/model/walk";
import { failureCopy } from "@/lib/write-retry";
import { toast } from "@/lib/toast";
import { ACTION_ACT_FAILED } from "@/convex/retroCopy";

export interface CreateActionInput {
  text: string;
  ownerId?: Id<"users">;
  dueAt?: number;
  source?: TopicRef;
}

/**
 * The action item writes (spec §13), each bound to a room per call so one
 * hook serves the retro's panel, the review (other rooms' items) and the
 * team page. None is optimistic: the list settles on the server's answer,
 * and a refusal surfaces as its copy.
 */
export interface ActionActions {
  /** Resolves to whether the item was written. */
  create: (roomId: Id<"rooms">, input: CreateActionInput) => Promise<boolean>;
  edit: (roomId: Id<"rooms">, actionId: Id<"retroActions">, text: string, dueAt: number | null) => void;
  setStatus: (roomId: Id<"rooms">, actionId: Id<"retroActions">, status: ActionStatus, note?: string) => void;
  assign: (roomId: Id<"rooms">, actionId: Id<"retroActions">, ownerId: Id<"users"> | undefined) => void;
  remove: (roomId: Id<"rooms">, actionId: Id<"retroActions">) => void;
}

async function act(write: Promise<unknown>): Promise<boolean> {
  try {
    await write;
    return true;
  } catch (error) {
    toast.error(failureCopy(error, ACTION_ACT_FAILED));
    return false;
  }
}

export function useActionActions(): ActionActions {
  const createAction = useMutation(api.retro.createAction);
  const updateAction = useMutation(api.retro.updateAction);
  const setActionStatus = useMutation(api.retro.setActionStatus);
  const assignAction = useMutation(api.retro.assignAction);
  const deleteAction = useMutation(api.retro.deleteAction);

  const create = useCallback<ActionActions["create"]>(
    (roomId, input) => act(createAction({ roomId, ...input })),
    [createAction]
  );
  const edit = useCallback<ActionActions["edit"]>(
    (roomId, actionId, text, dueAt) => void act(updateAction({ roomId, actionId, text, dueAt })),
    [updateAction]
  );
  const setStatus = useCallback<ActionActions["setStatus"]>(
    (roomId, actionId, status, note) =>
      void act(setActionStatus({ roomId, actionId, status, ...(note !== undefined ? { note } : {}) })),
    [setActionStatus]
  );
  const assign = useCallback<ActionActions["assign"]>(
    (roomId, actionId, ownerId) =>
      void act(assignAction({ roomId, actionId, ...(ownerId !== undefined ? { ownerId } : {}) })),
    [assignAction]
  );
  const remove = useCallback<ActionActions["remove"]>(
    (roomId, actionId) => void act(deleteAction({ roomId, actionId })),
    [deleteAction]
  );

  return useMemo(() => ({ create, edit, setStatus, assign, remove }), [create, edit, setStatus, assign, remove]);
}
