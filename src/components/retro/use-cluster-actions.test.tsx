/**
 * The cluster writes (spec §10.3, §10.7, §10.8): group and ungroup retry a
 * transient failure and drop a refusal at once with its reason; rename,
 * merge and dissolve resolve to whether they went through and toast a
 * refusal's copy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown }[],
  outcomes: [] as (() => Promise<unknown>)[],
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    retro: {
      formCluster: "retro.formCluster",
      addToCluster: "retro.addToCluster",
      removeFromCluster: "retro.removeFromCluster",
      renameCluster: "retro.renameCluster",
      mergeClusters: "retro.mergeClusters",
      dissolveCluster: "retro.dissolveCluster",
    },
  },
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

import { useClusterActions } from "./use-cluster-actions";

const roomId = "room1" as Id<"rooms">;
const k1 = "k1" as Id<"retroClusters">;
const k2 = "k2" as Id<"retroClusters">;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.calls.length = 0;
  mocks.outcomes.length = 0;
  mocks.toast.error.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("useClusterActions: group and ungroup", () => {
  it("form retries a transient failure with the same selection and stays silent on success", async () => {
    mocks.outcomes.push(() => Promise.reject(new Error("network")), () => Promise.resolve("k-new"));
    const { result } = renderHook(() => useClusterActions(roomId));
    result.current.form(["a", "b"]);
    await vi.advanceTimersByTimeAsync(400);
    expect(mocks.calls.map((c) => c.fn)).toEqual(["retro.formCluster", "retro.formCluster"]);
    expect(mocks.calls[1].args).toEqual({ roomId, clientIds: ["a", "b"] });
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("addTo and removeFrom carry the ids; a refusal is not retried and toasts its reason", async () => {
    mocks.outcomes.push(
      () => Promise.resolve(),
      () => Promise.reject(new ConvexError({ code: "missing", message: "That group is no longer on the board" }))
    );
    const { result } = renderHook(() => useClusterActions(roomId));
    result.current.addTo(k1, ["a"]);
    result.current.removeFrom(["b"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.calls).toEqual([
      { fn: "retro.addToCluster", args: { roomId, clusterId: k1, clientIds: ["a"] } },
      { fn: "retro.removeFromCluster", args: { roomId, clientIds: ["b"] } },
    ]);
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).toHaveBeenCalledWith("That group is no longer on the board");
  });
});

describe("useClusterActions: cardManagement acts", () => {
  it("rename, merge and dissolve resolve true on success and pass their arguments through", async () => {
    mocks.outcomes.push(() => Promise.resolve(), () => Promise.resolve(), () => Promise.resolve());
    const { result } = renderHook(() => useClusterActions(roomId));
    expect(await result.current.rename(k1, "Demo")).toBe(true);
    expect(await result.current.merge(k1, k2)).toBe(true);
    expect(await result.current.dissolve(k2)).toBe(true);
    expect(mocks.calls).toEqual([
      { fn: "retro.renameCluster", args: { roomId, clusterId: k1, name: "Demo" } },
      { fn: "retro.mergeClusters", args: { roomId, from: k1, into: k2 } },
      { fn: "retro.dissolveCluster", args: { roomId, clusterId: k2 } },
    ]);
  });

  it("a refused rename resolves false and toasts the refusal's copy", async () => {
    mocks.outcomes.push(() =>
      Promise.reject(new ConvexError({ code: "forbidden", message: "Only facilitators can do that" }))
    );
    const { result } = renderHook(() => useClusterActions(roomId));
    expect(await result.current.rename(k1, "Demo")).toBe(false);
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.toast.error).toHaveBeenCalledWith("Only facilitators can do that");
  });
});
