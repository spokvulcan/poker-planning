import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { DEFAULT_TIME_NODES, useRememberedTimeNodes } from "./use-remembered-time-nodes";

// The time nodes a new room shows (ADR-0032), remembered in this browser for
// the next room.

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useRememberedTimeNodes", () => {
  it("starts with the timer and no session time", () => {
    const { result } = renderHook(() => useRememberedTimeNodes());
    expect(result.current[0]).toEqual(DEFAULT_TIME_NODES);
  });

  it("remembers a pick for the next room", () => {
    const first = renderHook(() => useRememberedTimeNodes());
    act(() => first.result.current[1]({ timer: false, sessionTime: true }));
    expect(first.result.current[0]).toEqual({ timer: false, sessionTime: true });
    first.unmount();

    const next = renderHook(() => useRememberedTimeNodes());
    expect(next.result.current[0]).toEqual({ timer: false, sessionTime: true });
  });

  it("keeps the pick for this room where storage is blocked, and ignores what it cannot read", () => {
    localStorage.setItem("agilekit:new-room:time-nodes", "not json");
    const { result } = renderHook(() => useRememberedTimeNodes());
    expect(result.current[0]).toEqual(DEFAULT_TIME_NODES);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    act(() => result.current[1]({ timer: true, sessionTime: true }));
    expect(result.current[0]).toEqual({ timer: true, sessionTime: true });
  });
});
