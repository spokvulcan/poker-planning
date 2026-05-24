/**
 * useCardSelection — server-sync restore/clear (user stories 4, 5, 17, 22).
 *
 * The server returns the current user's own vote label even before reveal, so a
 * remount (e.g. an OAuth redirect) must restore the highlight, and a cleared
 * vote must drop it. Exercised through the hook's public surface — the returned
 * `selectedCardValue` — never its internal effect.
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData, SanitizedVote } from "@/convex/model/rooms";
import { useCardSelection } from "./useCardSelection";

const USER_ID = "user-1" as Id<"users">;

/** Minimal room data — the hook only reads `votes`. */
function roomData(votes: Partial<SanitizedVote>[]): RoomWithRelatedData {
  return { votes } as unknown as RoomWithRelatedData;
}

describe("useCardSelection — server sync", () => {
  it("restores the highlight from the user's own vote on mount", () => {
    const { result } = renderHook(() =>
      useCardSelection({
        roomData: roomData([{ userId: USER_ID, hasVoted: true, cardLabel: "8" }]),
        currentUserId: USER_ID,
      }),
    );

    expect(result.current.selectedCardValue).toBe("8");
  });

  it("clears the highlight when the user's vote is gone", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: RoomWithRelatedData }) =>
        useCardSelection({ roomData: data, currentUserId: USER_ID }),
      {
        initialProps: {
          data: roomData([{ userId: USER_ID, hasVoted: true, cardLabel: "8" }]),
        },
      },
    );

    expect(result.current.selectedCardValue).toBe("8");

    rerender({ data: roomData([{ userId: USER_ID, hasVoted: false }]) });

    expect(result.current.selectedCardValue).toBeNull();
  });

  it("leaves the highlight untouched while there is no current user", () => {
    const { result } = renderHook(() =>
      useCardSelection({
        roomData: roomData([{ userId: USER_ID, hasVoted: true, cardLabel: "8" }]),
        currentUserId: undefined,
      }),
    );

    expect(result.current.selectedCardValue).toBeNull();
  });
});
