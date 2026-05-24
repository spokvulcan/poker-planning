/**
 * useDeleteConfirmation — the confirm-vs-delete-now branching (user stories
 * 3/15/20). Built on the canvas-actions primitives, so the deleteNote/removeUser
 * spies stand in for them. Asserts the branch behavior and pending state through
 * the hook's public surface.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import { useDeleteConfirmation } from "./useDeleteConfirmation";

const USER_ID = "user-1" as Id<"users">;

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
  it("opens the dialog for another player without removing", () => {
    const { removeUser, result } = setup();

    act(() => result.current.requestDeletePlayer(USER_ID, "Ada", false));

    expect(removeUser).not.toHaveBeenCalled();
    expect(result.current.pendingPlayer).toEqual({ id: USER_ID, name: "Ada" });
  });

  it("is a no-op for self-removal", () => {
    const { removeUser, result } = setup();

    act(() => result.current.requestDeletePlayer(USER_ID, "Ada", true));

    expect(removeUser).not.toHaveBeenCalled();
    expect(result.current.pendingPlayer).toBeNull();
  });

  it("confirmPlayer removes the pending player and clears it", () => {
    const { removeUser, result } = setup();
    act(() => result.current.requestDeletePlayer(USER_ID, "Ada", false));

    act(() => result.current.confirmPlayer());

    expect(removeUser).toHaveBeenCalledWith(USER_ID);
    expect(result.current.pendingPlayer).toBeNull();
  });

  it("dismissPlayer clears pending state without removing", () => {
    const { removeUser, result } = setup();
    act(() => result.current.requestDeletePlayer(USER_ID, "Ada", false));

    act(() => result.current.dismissPlayer());

    expect(removeUser).not.toHaveBeenCalled();
    expect(result.current.pendingPlayer).toBeNull();
  });
});
