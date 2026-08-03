/**
 * useIssueActions — the seam that owns every issues-panel backend write, shaped
 * like useCanvasActions. Two contracts are tested through the returned actions
 * object, never the internal ref bookkeeping:
 *
 *  1. Demo no-op (ADR-0003): inside a demo context every method must issue zero
 *     backend writes. One adapter, not a guard per control.
 *  2. Identity stability: the object and each method keep referential identity
 *     across re-renders, including input changes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";

// Hoisted recorder shared with the (hoisted) vi.mock factory below. Every
// useMutation returns a recording function, so any backend write is observable.
const writes = vi.hoisted(() => ({
  calls: [] as { args: unknown }[],
}));

vi.mock("convex/react", () => ({
  useMutation: () => (args: unknown) => {
    writes.calls.push({ args });
    return Promise.resolve(undefined);
  },
  useQuery: () => undefined,
}));

import { DemoSimulationProvider } from "../demo/DemoSimulationProvider";
import { useIssueActions } from "./useIssueActions";

const ROOM_ID = "room-1" as Id<"rooms">;
const ISSUE_ID = "issue-1" as Id<"issues">;

/** Invokes every action method, with throwaway args where required. */
function invokeAll(actions: ReturnType<typeof useIssueActions>) {
  actions.createIssue("New issue");
  actions.startVoting(ISSUE_ID);
  actions.switchToQuickVote();
  actions.updateTitle(ISSUE_ID, "Renamed");
  actions.updateEstimate(ISSUE_ID, "5");
  actions.deleteIssue(ISSUE_ID);
  actions.reorderIssues([ISSUE_ID]);
}

beforeEach(() => {
  writes.calls = [];
});

describe("useIssueActions — demo no-op", () => {
  it("issues zero backend writes for every method under a demo context", async () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(DemoSimulationProvider, null, children);

    const { result } = renderHook(() => useIssueActions({ roomId: ROOM_ID }), {
      wrapper,
    });

    await act(async () => {
      invokeAll(result.current);
    });

    expect(writes.calls).toEqual([]);
  });
});

describe("useIssueActions — identity stability", () => {
  it("keeps the actions object and every method stable across re-renders", () => {
    const { result, rerender } = renderHook(
      ({ roomId }: { roomId: Id<"rooms"> }) => useIssueActions({ roomId }),
      { initialProps: { roomId: ROOM_ID } },
    );

    const first = result.current;
    const firstMethods = { ...first };

    // Re-render with no change, then with a changed input.
    rerender({ roomId: ROOM_ID });
    rerender({ roomId: "room-2" as Id<"rooms"> });

    expect(result.current).toBe(first);
    for (const key of Object.keys(firstMethods) as (keyof typeof first)[]) {
      expect(result.current[key]).toBe(firstMethods[key]);
    }
  });
});

describe("useIssueActions — real mode pass-through", () => {
  it("invokes the latest closure through the stable method and writes", async () => {
    const { result, rerender } = renderHook(
      ({ roomId }: { roomId: Id<"rooms"> }) => useIssueActions({ roomId }),
      { initialProps: { roomId: ROOM_ID } },
    );

    rerender({ roomId: "room-2" as Id<"rooms"> });
    await act(async () => result.current.startVoting(ISSUE_ID));

    expect(writes.calls).toHaveLength(1);
    expect(writes.calls[0].args).toMatchObject({
      roomId: "room-2",
      issueId: ISSUE_ID,
    });
  });
});
