/**
 * useCanvasActions — the deep seam that owns every canvas-triggered backend
 * write. Two contracts are tested through the returned actions object, never the
 * internal ref bookkeeping:
 *
 *  1. Demo no-op (ADR-0003, user stories 8/9/12/19): inside a demo context every
 *     method must issue zero backend writes. One adapter, not ten guards.
 *  2. Identity stability (user stories 11/13/18): the object and each method keep
 *     referential identity across re-renders, including input changes. This is
 *     the direct regression guard for the canvas render loop.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";

// Hoisted recorder shared with the (hoisted) vi.mock factory below. Every
// useMutation returns a recording function, so any backend write is observable.
const writes = vi.hoisted(() => ({ calls: [] as { args: unknown }[] }));

vi.mock("convex/react", () => ({
  useMutation: () => (args: unknown) => {
    writes.calls.push({ args });
    return Promise.resolve(undefined);
  },
  useQuery: () => undefined,
}));

import { DemoSimulationProvider } from "../demo/DemoSimulationProvider";
import { DEMO_ROOM_ID } from "../demo/fixtures";
import { useCanvasActions } from "./useCanvasActions";

const ROOM_ID = "room-1" as Id<"rooms">;
const USER_ID = "user-1" as Id<"users">;
const ISSUE_ID = "issue-1" as Id<"issues">;

/** Invokes every action method, with throwaway args where required. */
function invokeAll(actions: ReturnType<typeof useCanvasActions>) {
  actions.reveal();
  actions.reset();
  actions.toggleAutoComplete();
  actions.cancelAutoReveal();
  actions.selectCard("8");
  actions.updateNoteContent("note-1", "hello");
  actions.createNote(ISSUE_ID);
  actions.deleteNote("note-1");
  actions.updateNodePosition("note-1", { x: 1, y: 2 });
  actions.removeUser(USER_ID);
}

beforeEach(() => {
  writes.calls = [];
});

describe("useCanvasActions — demo no-op", () => {
  it("issues zero backend writes for every method under a demo context", async () => {
    const setSelectedCardValue = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(DemoSimulationProvider, null, children);

    const { result } = renderHook(
      () =>
        useCanvasActions({
          roomId: DEMO_ROOM_ID,
          currentUserId: undefined,
          setSelectedCardValue,
        }),
      { wrapper },
    );

    await act(async () => {
      invokeAll(result.current);
    });

    expect(writes.calls).toEqual([]);
    expect(setSelectedCardValue).not.toHaveBeenCalled();
  });
});

describe("useCanvasActions — identity stability", () => {
  it("keeps the actions object and every method stable across re-renders", () => {
    const setSelectedCardValue = vi.fn();
    const { result, rerender } = renderHook(
      ({ userId }: { userId?: Id<"users"> }) =>
        useCanvasActions({
          roomId: ROOM_ID,
          currentUserId: userId,
          setSelectedCardValue,
        }),
      { initialProps: { userId: USER_ID as Id<"users"> | undefined } },
    );

    const first = result.current;
    const firstMethods = { ...first };

    // Re-render with no change, then with a changed input.
    rerender({ userId: USER_ID });
    rerender({ userId: "user-2" as Id<"users"> });

    expect(result.current).toBe(first);
    for (const key of Object.keys(firstMethods) as (keyof typeof first)[]) {
      expect(result.current[key]).toBe(firstMethods[key]);
    }
  });

  it("invokes the latest closure through the stable method (real mode)", async () => {
    const setSelectedCardValue = vi.fn();
    const { result, rerender } = renderHook(
      ({ userId }: { userId?: Id<"users"> }) =>
        useCanvasActions({
          roomId: ROOM_ID,
          currentUserId: userId,
          setSelectedCardValue,
        }),
      { initialProps: { userId: undefined as Id<"users"> | undefined } },
    );

    // With no user, selectCard is a guarded no-op.
    await act(async () => result.current.selectCard("8"));
    expect(setSelectedCardValue).not.toHaveBeenCalled();

    // After a user arrives, the same stable method runs the latest closure.
    rerender({ userId: USER_ID });
    await act(async () => result.current.selectCard("8"));
    expect(setSelectedCardValue).toHaveBeenCalledWith("8");
    expect(writes.calls.length).toBe(1);
  });
});
