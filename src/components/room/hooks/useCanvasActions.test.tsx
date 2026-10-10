/**
 * useCanvasActions — the deep seam that owns every canvas-triggered backend
 * write. Three contracts are tested through the returned actions object, never the
 * internal ref bookkeeping:
 *
 *  1. Demo no-op (ADR-0003, user stories 8/9/12/19): inside a demo context every
 *     method must issue zero backend writes. One adapter, not ten guards.
 *  2. Identity stability (user stories 11/13/18): the object and each method keep
 *     referential identity across re-renders, including input changes. This is
 *     the direct regression guard for the canvas render loop.
 *  3. A refused write says why: the refusal's message is what the person is
 *     shown, whichever write the server turned away.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";

// Hoisted recorder shared with the (hoisted) vi.mock factory below. Every
// useMutation returns a recording function, so any backend write is observable.
// `failure` makes every mutation reject with it (for failure-path tests).
const writes = vi.hoisted(() => ({
  calls: [] as { args: unknown }[],
  failure: null as unknown,
}));

// What the person is shown when a write fails: every error toast's message.
const toasts = vi.hoisted(() => [] as string[]);

vi.mock("convex/react", () => ({
  useMutation: () => {
    const mutate = (args: unknown) => {
      writes.calls.push({ args });
      return writes.failure ? Promise.reject(writes.failure) : Promise.resolve(undefined);
    };
    return Object.assign(mutate, { withOptimisticUpdate: () => mutate });
  },
  useQuery: () => undefined,
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: (message: string) => toasts.push(message) },
}));

import { refusal } from "@/convex/model/refusal";
import { DemoSimulationProvider } from "../demo/DemoSimulationProvider";
import { DEMO_ROOM_ID } from "../demo/fixtures";
import { useCanvasActions, type CanvasActions } from "./useCanvasActions";

const ROOM_ID = "room-1" as Id<"rooms">;
const USER_ID = "user-1" as Id<"users">;
const ISSUE_ID = "issue-1" as Id<"issues">;
const OTHER_USER_ID = "user-2" as Id<"users">;

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
  actions.moveNodes([{ nodeId: "note-1", position: { x: 1, y: 2 } }]);
  actions.removeUser(USER_ID);
}

beforeEach(() => {
  writes.calls = [];
  writes.failure = null;
  toasts.length = 0;
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
          selectedCardValue: null,
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
          selectedCardValue: null,
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
          selectedCardValue: null,
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

describe("useCanvasActions — selectCard value handling", () => {
  it("picks a card by its label alone: the server reads its value from the deck", async () => {
    const setSelectedCardValue = vi.fn();
    const { result } = renderHook(() =>
      useCanvasActions({
        roomId: ROOM_ID,
        currentUserId: USER_ID,
        selectedCardValue: null,
        setSelectedCardValue,
      }),
    );

    await act(async () => result.current.selectCard("0.5"));

    expect(writes.calls).toHaveLength(1);
    expect(writes.calls[0].args).toEqual({
      roomId: ROOM_ID,
      userId: USER_ID,
      cardLabel: "0.5",
    });
  });

  it("rolls back to the prior card value when the pick mutation fails", async () => {
    writes.failure = new Error("mutation failed");
    const setSelectedCardValue = vi.fn();
    const { result } = renderHook(() =>
      useCanvasActions({
        roomId: ROOM_ID,
        currentUserId: USER_ID,
        // The user already has "5" highlighted.
        selectedCardValue: "5",
        setSelectedCardValue,
      }),
    );

    await act(async () => result.current.selectCard("8"));

    // Optimistic write to "8", then rollback to the prior "5" — never to null.
    expect(setSelectedCardValue.mock.calls).toEqual([["8"], ["5"]]);
  });
});

describe("useCanvasActions — a refused write says why", () => {
  /** Every write the board makes, as the person makes it. */
  const boardWrites: [string, (actions: CanvasActions) => unknown][] = [
    ["reveal", (actions) => actions.reveal()],
    ["reset", (actions) => actions.reset()],
    ["auto-reveal switch", (actions) => actions.toggleAutoComplete()],
    ["auto-reveal cancel", (actions) => actions.cancelAutoReveal()],
    ["card pick", (actions) => actions.selectCard("8")],
    ["move", (actions) => actions.moveNodes([{ nodeId: "note-1", position: { x: 1, y: 2 } }])],
    ["note save", (actions) => actions.updateNoteContent("note-1", "Risks: auth")],
    ["new note", (actions) => actions.createNote(ISSUE_ID)],
    ["note removal", (actions) => actions.deleteNote("note-1")],
    ["player removal", (actions) => actions.removeUser(OTHER_USER_ID)],
  ];

  function renderActions() {
    return renderHook(() =>
      useCanvasActions({
        roomId: ROOM_ID,
        currentUserId: USER_ID,
        selectedCardValue: null,
        setSelectedCardValue: vi.fn(),
      }),
    ).result;
  }

  it.each(boardWrites)("a refused %s shows the refusal's message", async (_, write) => {
    // Someone removed the viewer from the room while the board was open.
    writes.failure = refusal("forbidden", "Not a member of this room");
    const actions = renderActions();

    await act(async () => {
      await write(actions.current);
    });

    expect(toasts).toEqual(["Not a member of this room"]);
  });

  it("a refused note save says why, and tells the note its words didn't land", async () => {
    writes.failure = refusal("forbidden", "Note content too long (max 10000 characters)");
    const actions = renderActions();

    let landed = true;
    await act(async () => {
      landed = await actions.current.updateNoteContent("note-1", "a".repeat(10_001));
    });

    expect(landed).toBe(false);
    expect(toasts).toEqual(["Note content too long (max 10000 characters)"]);
  });
});
