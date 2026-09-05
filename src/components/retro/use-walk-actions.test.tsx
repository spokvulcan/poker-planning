/**
 * The walk writes (spec §12.2, §10.7): cursor, coverage and raise go to the
 * server as they are, never optimistic, and a refusal comes back as its
 * copy while a transient failure gets the fallback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown }[],
  outcomes: [] as (() => Promise<unknown>)[],
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { retro: { setWalkCursor: "retro.setWalkCursor", markCovered: "retro.markCovered", raise: "retro.raise" } },
}));
vi.mock("convex/react", () => ({
  useMutation: (ref: string) => async (args: unknown) => {
    mocks.calls.push({ fn: ref, args });
    const next = mocks.outcomes.shift();
    return next ? await next() : undefined;
  },
}));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));

import { useWalkActions } from "./use-walk-actions";

const roomId = "room1" as Id<"rooms">;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.outcomes.length = 0;
  mocks.toast.error.mockClear();
});

describe("useWalkActions", () => {
  it("sends each act once with its arguments and stays silent on success", async () => {
    const { result } = renderHook(() => useWalkActions(roomId));
    result.current.setCursor(2);
    result.current.markCovered("k1", true);
    result.current.raise({ kind: "card", id: "c1" as Id<"retroCards"> });
    await flush();
    expect(mocks.calls).toEqual([
      { fn: "retro.setWalkCursor", args: { roomId, index: 2 } },
      { fn: "retro.markCovered", args: { roomId, topicId: "k1", covered: true } },
      { fn: "retro.raise", args: { roomId, topicRef: { kind: "card", id: "c1" } } },
    ]);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("toasts a refusal's copy, and the fallback for a failure, without retrying", async () => {
    mocks.outcomes.push(
      () => Promise.reject(new ConvexError({ code: "stage", message: "The walk opens in Discuss" })),
      () => Promise.reject(new Error("network"))
    );
    const { result } = renderHook(() => useWalkActions(roomId));
    result.current.raise({ kind: "cluster", id: "k1" as Id<"retroClusters"> });
    await flush();
    result.current.setCursor(0);
    await flush();
    expect(mocks.calls).toHaveLength(2);
    expect(mocks.toast.error.mock.calls.map((c) => c[0])).toEqual([
      "The walk opens in Discuss",
      "That did not go through. Try again.",
    ]);
  });
});
