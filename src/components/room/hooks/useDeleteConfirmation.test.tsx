/**
 * useDeleteConfirmation — the confirm-vs-delete-now branching (user stories
 * 3/15/20). Built on the canvas-actions primitives, so the deleteNote/removeUser
 * spies stand in for them. Asserts the branch behavior and pending state through
 * the hook's public surface.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ResolvedDecision } from "@/convex/permissions";
import { useDeleteConfirmation, type PlayerRemovalRequest } from "./useDeleteConfirmation";

const USER_ID = "user-1" as Id<"users">;
const BOB_ID = "user-2" as Id<"users">;
const SELF_ID = "user-3" as Id<"users">;
const ALLOWED: ResolvedDecision = { allowed: true };
const DENIED: ResolvedDecision = {
  allowed: false,
  message: "Only facilitators and the owner can remove members.",
};

function setup() {
  const deleteNote = vi.fn();
  const removeUser = vi.fn();
  const { result } = renderHook(() =>
    useDeleteConfirmation({ deleteNote, removeUser }),
  );
  return { deleteNote, removeUser, result };
}

describe("useDeleteConfirmation — note branch", () => {
  it("deletes an empty note immediately without opening the dialog", () => {
    const { deleteNote, result } = setup();

    act(() => result.current.requestDeleteNote("note-1", false));

    expect(deleteNote).toHaveBeenCalledWith("note-1");
    expect(result.current.pendingNote).toBeNull();
  });

  it("opens the dialog for a note with content and does not delete", () => {
    const { deleteNote, result } = setup();

    act(() => result.current.requestDeleteNote("note-1", true));

    expect(deleteNote).not.toHaveBeenCalled();
    expect(result.current.pendingNote).toBe("note-1");
  });

  it("confirmNote deletes the pending note and clears it", () => {
    const { deleteNote, result } = setup();
    act(() => result.current.requestDeleteNote("note-1", true));

    act(() => result.current.confirmNote());

    expect(deleteNote).toHaveBeenCalledWith("note-1");
    expect(result.current.pendingNote).toBeNull();
  });

  it("dismissNote clears pending state without deleting", () => {
    const { deleteNote, result } = setup();
    act(() => result.current.requestDeleteNote("note-1", true));

    act(() => result.current.dismissNote());

    expect(deleteNote).not.toHaveBeenCalled();
    expect(result.current.pendingNote).toBeNull();
  });
});

describe("useDeleteConfirmation — player branch", () => {
  const ada = (overrides: Partial<PlayerRemovalRequest> = {}): PlayerRemovalRequest => ({
    id: USER_ID,
    name: "Ada",
    isSelf: false,
    removeDecision: ALLOWED,
    ...overrides,
  });
  const bob = (overrides: Partial<PlayerRemovalRequest> = {}): PlayerRemovalRequest => ({
    id: BOB_ID,
    name: "Bob",
    isSelf: false,
    removeDecision: ALLOWED,
    ...overrides,
  });

  it("opens the dialog for another player without removing", () => {
    const { removeUser, result } = setup();

    act(() => result.current.requestRemovePlayers([ada()]));

    expect(removeUser).not.toHaveBeenCalled();
    expect(result.current.pendingPlayers).toEqual([{ id: USER_ID, name: "Ada" }]);
  });

  it("asks once about every player one Delete selected", () => {
    const { removeUser, result } = setup();

    act(() => result.current.requestRemovePlayers([ada(), bob()]));

    expect(removeUser).not.toHaveBeenCalled();
    expect(result.current.pendingPlayers).toEqual([
      { id: USER_ID, name: "Ada" },
      { id: BOB_ID, name: "Bob" },
    ]);
  });

  it("is a no-op for self-removal", () => {
    const { removeUser, result } = setup();

    act(() => result.current.requestRemovePlayers([ada({ isSelf: true })]));

    expect(removeUser).not.toHaveBeenCalled();
    expect(result.current.pendingPlayers).toEqual([]);
  });

  it("refuses removal when the remove decision is denied", () => {
    const { removeUser, result } = setup();

    act(() => result.current.requestRemovePlayers([ada({ removeDecision: DENIED })]));

    expect(removeUser).not.toHaveBeenCalled();
    expect(result.current.pendingPlayers).toEqual([]);
  });

  it("asks only about the players the viewer may remove, never themselves", () => {
    const { result } = setup();
    const self = { id: SELF_ID, name: "Me", isSelf: true, removeDecision: ALLOWED };

    act(() =>
      result.current.requestRemovePlayers([ada({ removeDecision: DENIED }), self, bob()]),
    );

    expect(result.current.pendingPlayers).toEqual([{ id: BOB_ID, name: "Bob" }]);
  });

  it("confirmPlayers removes every pending player and clears them", () => {
    const { removeUser, result } = setup();
    act(() => result.current.requestRemovePlayers([ada(), bob()]));

    act(() => result.current.confirmPlayers());

    expect(removeUser.mock.calls).toEqual([[USER_ID], [BOB_ID]]);
    expect(result.current.pendingPlayers).toEqual([]);
  });

  it("dismissPlayers clears pending state without removing", () => {
    const { removeUser, result } = setup();
    act(() => result.current.requestRemovePlayers([ada(), bob()]));

    act(() => result.current.dismissPlayers());

    expect(removeUser).not.toHaveBeenCalled();
    expect(result.current.pendingPlayers).toEqual([]);
  });
});
