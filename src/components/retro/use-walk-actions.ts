"use client";

import { useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TopicRef } from "@/convex/model/walk";
import { failureCopy } from "@/lib/write-retry";
import { toast } from "@/lib/toast";
import { WALK_ACT_FAILED } from "@/convex/retroCopy";

/** The walk's `stageFlow` acts (spec §12.2); none is optimistic. */
export interface WalkActions {
  setCursor: (index: number) => void;
  markCovered: (topicId: string, covered: boolean) => void;
  raise: (ref: TopicRef) => void;
}

/** One act: the board settles on the server's answer; a failure surfaces as its copy. */
async function act(write: Promise<unknown>): Promise<void> {
  try {
    await write;
  } catch (error) {
    toast.error(failureCopy(error, WALK_ACT_FAILED));
  }
}

/**
 * The walk writes (spec §12.2, ADR-0023): cursor, coverage and raise are
 * shared state every browser follows, so none is optimistic — the panel
 * shows what the server holds — and each surfaces a refusal as its copy.
 */
export function useWalkActions(roomId: Id<"rooms">): WalkActions {
  const setWalkCursor = useMutation(api.retro.setWalkCursor);
  const markCoveredMutation = useMutation(api.retro.markCovered);
  const raiseMutation = useMutation(api.retro.raise);

  const setCursor = useCallback<WalkActions["setCursor"]>(
    (index) => void act(setWalkCursor({ roomId, index })),
    [setWalkCursor, roomId]
  );
  const markCovered = useCallback<WalkActions["markCovered"]>(
    (topicId, covered) => void act(markCoveredMutation({ roomId, topicId, covered })),
    [markCoveredMutation, roomId]
  );
  const raise = useCallback<WalkActions["raise"]>(
    (ref) => void act(raiseMutation({ roomId, topicRef: ref })),
    [raiseMutation, roomId]
  );

  return useMemo(() => ({ setCursor, markCovered, raise }), [setCursor, markCovered, raise]);
}
