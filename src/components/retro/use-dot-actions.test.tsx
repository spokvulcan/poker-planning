/**
 * The dot writes (spec §10.8, §11): a dot past the budget or the topic's
 * cap is refused in the browser and never sent; one under it is sent and
 * retried on a transient failure; a server refusal toasts its reason.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel";
import type { TallyRead } from "@/convex/model/retroVotes";

const mocks = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown }[],
  outcomes: [] as (() => Promise<unknown>)[],
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { retro: { placeDot: "retro.placeDot", removeDot: "retro.removeDot" } },
}));
vi.mock("convex/react", () => ({
  useMutation: (ref: string) => {
    const fn = async (args: unknown) => {
      mocks.calls.push({ fn: ref, args });
      const next = mocks.outcomes.shift();
      return next ? await next() : undefined;
    };
    return Object.assign(fn, { withOptimisticUpdate: () => fn });
  },
}));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));

import { useDotActions } from "./use-dot-actions";

const roomId = "room1" as Id<"rooms">;
const onCard = { kind: "card" as const, id: "c1" as Id<"retroCards"> };
const tally = (patch: Partial<TallyRead> = {}): TallyRead => ({
  stageEntryId: "v1",
  visible: false,
  counts: {},
  mine: {},
  spent: 0,
  budget: 5,
  ...patch,
});

beforeEach(() => {
  vi.useFakeTimers();
  mocks.calls.length = 0;
  mocks.outcomes.length = 0;
  mocks.toast.error.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("useDotActions", () => {
  it("refuses the sixth dot locally: a toast, no call", () => {
    const { result } = renderHook(() => useDotActions(roomId, tally({ spent: 5 })));
    result.current.place(onCard);
    expect(mocks.calls).toEqual([]);
    expect(mocks.toast.error).toHaveBeenCalledWith("All your votes are placed");
  });

  it("refuses a capped topic locally, and sends a dot elsewhere", async () => {
    mocks.outcomes.push(() => Promise.resolve());
    const { result } = renderHook(() => useDotActions(roomId, tally({ spent: 1, maxPerTopic: 1, mine: { c1: 1 } })));
    result.current.place(onCard);
    expect(mocks.calls).toEqual([]);
    expect(mocks.toast.error).toHaveBeenCalledWith("No more votes on this topic");
    const elsewhere = { kind: "cluster" as const, id: "k1" as Id<"retroClusters"> };
    result.current.place(elsewhere);
    await vi.advanceTimersByTimeAsync(10);
    expect(mocks.calls).toEqual([{ fn: "retro.placeDot", args: { roomId, target: elsewhere } }]);
  });

  it("a forced dot the server refuses with `budget` toasts the reason and is not retried", async () => {
    mocks.outcomes.push(() => Promise.reject(new ConvexError({ code: "budget", message: "All your votes are placed" })));
    const { result } = renderHook(() => useDotActions(roomId, tally({ spent: 4 })));
    result.current.place(onCard);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).toHaveBeenCalledWith("All your votes are placed");
  });

  it("remove retries a transient failure and stays silent on success", async () => {
    mocks.outcomes.push(() => Promise.reject(new Error("network")), () => Promise.resolve());
    const { result } = renderHook(() => useDotActions(roomId, tally({ spent: 1, mine: { c1: 1 } })));
    result.current.remove(onCard);
    await vi.advanceTimersByTimeAsync(400);
    expect(mocks.calls.map((c) => c.fn)).toEqual(["retro.removeDot", "retro.removeDot"]);
    expect(mocks.calls[1].args).toEqual({ roomId, target: onCard });
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });
});
