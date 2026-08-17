/**
 * use-timer-sync — the TimerNode's hook, with its writes routed through the
 * canvas-actions seam. Pinned here:
 *
 *  1. Demo no-op (ADR-0003): inside a demo context start/pause/reset issue
 *     zero backend writes, the display is the local stopped 0:00, and no error
 *     is surfaced — the old "User ID required" red error is unreachable.
 *  2. Real room: the controls forward to the seam with the acting user; with
 *     no acting user they no-op silently (the same guard as selectCard & co.).
 *  3. The display still derives from the persisted timer state via the shared
 *     math — the seam changed only where writes go.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { TimerState } from "@/convex/timerState";

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
import { useTimerSync } from "./use-timer-sync";

const ROOM_ID = "room-1" as Id<"rooms">;
const USER_ID = "user-1" as Id<"users">;

// A stopped persisted timer, as a freshly created canvas node delivers it.
const STOPPED_TIMER_STATE: TimerState = {
  startedAt: null,
  pausedAt: null,
  elapsedSeconds: 0,
  isRunning: false,
  lastUpdatedBy: null,
  lastAction: null,
};

beforeEach(() => {
  writes.calls = [];
});

describe("use-timer-sync — demo no-op", () => {
  it("issues zero backend writes, shows 0:00, and never surfaces an error", async () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(DemoSimulationProvider, null, children);

    const { result } = renderHook(
      () =>
        useTimerSync({
          roomId: ROOM_ID,
          nodeId: "timer",
          // The demo viewer has no membership, so buildCanvasNodes passes no id.
          userId: undefined,
          timerState: STOPPED_TIMER_STATE,
        }),
      { wrapper },
    );

    await act(async () => {
      result.current.onStart();
      result.current.onPause();
      result.current.onReset();
    });

    expect(writes.calls).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.displayTime).toBe("0:00");
    expect(result.current.isRunning).toBe(false);
  });
});

describe("use-timer-sync — real room", () => {
  it("forwards start/pause/reset to the seam with the acting user", async () => {
    const { result } = renderHook(() =>
      useTimerSync({
        roomId: ROOM_ID,
        nodeId: "timer",
        userId: USER_ID,
        timerState: STOPPED_TIMER_STATE,
      }),
    );

    await act(async () => {
      result.current.onStart();
      result.current.onPause();
      result.current.onReset();
    });

    expect(writes.calls).toHaveLength(3);
    for (const call of writes.calls) {
      expect(call.args).toEqual({
        roomId: ROOM_ID,
        nodeId: "timer",
        userId: USER_ID,
      });
    }
    expect(result.current.error).toBeNull();
  });

  it("no-ops silently with no acting user (the old red-error case)", async () => {
    const { result } = renderHook(() =>
      useTimerSync({
        roomId: ROOM_ID,
        nodeId: "timer",
        userId: undefined,
        timerState: STOPPED_TIMER_STATE,
      }),
    );

    await act(async () => result.current.onStart());

    expect(writes.calls).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("derives the display from the persisted timer state", () => {
    const { result } = renderHook(() =>
      useTimerSync({
        roomId: ROOM_ID,
        nodeId: "timer",
        userId: USER_ID,
        timerState: {
          ...STOPPED_TIMER_STATE,
          isRunning: true,
          startedAt: Date.now() - 65_000,
        },
      }),
    );

    expect(result.current.isRunning).toBe(true);
    expect(result.current.displayTime).toBe("1:05");
  });
});
