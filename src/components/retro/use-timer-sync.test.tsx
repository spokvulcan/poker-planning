/**
 * use-timer-sync — the retro TimerNode's hook, with its writes routed through
 * the timer's actions seam. Pinned here:
 *
 *  1. The controls forward to the seam with the acting user; with no acting
 *     user they no-op silently.
 *  2. The display derives from the persisted timer state via the shared math.
 *  3. A refused timer write shows the refusal's message.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { TimerState } from "@/convex/timerState";

// What the person is shown when a write fails: every error toast's message.
const toasts = vi.hoisted(() => [] as string[]);

// Convex as the whiteboard's test stand-in: every write is recorded, and the
// server refuses them when a test says so.
vi.mock("convex/react", async (importOriginal) =>
  (await import("@/components/whiteboard/testing/convex")).mockConvexReact(await importOriginal<object>())
);

vi.mock("@/lib/toast", () => ({
  toast: { error: (message: string) => toasts.push(message) },
}));

import { refusal } from "@/convex/model/refusal";
import { convex, refuse, resetConvex } from "@/components/whiteboard/testing/convex";
import { useTimerSync } from "./use-timer-sync";

const ROOM_ID = "room-1" as Id<"rooms">;
const USER_ID = "user-1" as Id<"users">;

// A stopped persisted timer, as a freshly created canvas node delivers it.
const STOPPED_TIMER_STATE: TimerState = {
  startedAt: null,
  pausedAt: null,
  elapsedSeconds: 0,
  isRunning: false,
  lastAction: null,
};

beforeEach(() => {
  resetConvex();
  toasts.length = 0;
});

describe("use-timer-sync — the controls", () => {
  it("forwards start/pause/reset to the seam, leaving who is calling to the server", async () => {
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

    expect(convex.writes).toHaveLength(3);
    for (const call of convex.writes) {
      expect(call.args).toEqual({
        roomId: ROOM_ID,
        nodeId: "timer",
      });
    }
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

    expect(convex.writes).toEqual([]);
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

describe("use-timer-sync — a refused write says why", () => {
  it.each([
    ["start", "onStart"],
    ["pause", "onPause"],
    ["reset", "onReset"],
  ] as const)("a refused timer %s shows the refusal's message", async (_, control) => {
    // Someone removed the viewer from the room while the board was open.
    refuse(refusal("forbidden", "Not a member of this room"));
    const { result } = renderHook(() =>
      useTimerSync({
        roomId: ROOM_ID,
        nodeId: "timer",
        userId: USER_ID,
        timerState: STOPPED_TIMER_STATE,
      }),
    );

    await act(async () => {
      await result.current[control]();
    });

    expect(toasts).toEqual(["Not a member of this room"]);
  });
});
