"use client";

import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData, SanitizedVote } from "@/convex/model/rooms";

interface UseCardSelectionProps {
  roomData: RoomWithRelatedData;
  currentUserId?: Id<"users">;
}

interface UseCardSelectionReturn {
  selectedCardValue: string | null;
  setSelectedCardValue: (value: string | null) => void;
}

/**
 * Owns the locally-tracked selected card and keeps it in sync with the server.
 *
 * The server returns the current user's own vote label even before reveal, so
 * the highlight is restored after a remount (e.g. an OAuth redirect) and cleared
 * once the vote is gone. The value is read during render to mark cards selected,
 * so it lives here; the setter is injected into the canvas-actions module, which
 * sets it optimistically when a card is picked.
 */
export function useCardSelection({
  roomData,
  currentUserId,
}: UseCardSelectionProps): UseCardSelectionReturn {
  const [selectedCardValue, setSelectedCardValue] = useState<string | null>(
    null,
  );

  // The server's view of the user's own vote.
  const userVote = roomData?.votes.find(
    (v: SanitizedVote) => v.userId === currentUserId,
  );
  const hasVoted = userVote?.hasVoted;
  const voteLabel = userVote?.cardLabel;

  // Reconcile the highlight with the server during render, not in an effect
  // (React's "adjust state when an input changes" pattern — see "You Might Not
  // Need an Effect"). A `null` key means "no current user → leave the highlight
  // alone", which also keeps a freshly-picked card highlighted while the vote is
  // still in flight (the key only changes once the server reflects the vote).
  const voteKey =
    currentUserId == null ? null : `${hasVoted ? "1" : "0"}:${voteLabel ?? ""}`;
  const [syncedVoteKey, setSyncedVoteKey] = useState<string | null>(null);

  if (voteKey !== null && voteKey !== syncedVoteKey) {
    setSyncedVoteKey(voteKey);
    if (!hasVoted) {
      setSelectedCardValue(null);
    } else if (voteLabel) {
      setSelectedCardValue(voteLabel);
    }
  }

  return { selectedCardValue, setSelectedCardValue };
}
