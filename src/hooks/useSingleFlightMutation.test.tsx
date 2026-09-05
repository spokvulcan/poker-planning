/**
 * Keyed single-flight (ADR-0022, spec §10.6): one request in flight per key,
 * the latest pending args replacing any queued ones for that key, and keys
 * independent of one another. Two drops of card A while one is in flight
 * send two writes with the last position; a drop of card B during A's
 * flight is not delayed.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSingleFlightMutation } from "./useSingleFlightMutation";

type Args = { id: string; x: number };

function deferredMutation() {
  const calls: Args[] = [];
  const pending: Array<() => void> = [];
  const mutation = (args: Args) =>
    new Promise<void>((resolve) => {
      calls.push(args);
      pending.push(resolve);
    });
  return { calls, mutation, settle: () => pending.shift()?.() };
}

describe("useSingleFlightMutation", () => {
  it("collapses a flurry on one key to the in-flight write plus one with the latest args", async () => {
    const { calls, mutation, settle } = deferredMutation();
    const { result } = renderHook(() => useSingleFlightMutation(mutation, (a: Args) => a.id));

    let first!: Promise<void>, second!: Promise<void>, third!: Promise<void>;
    act(() => {
      first = result.current({ id: "A", x: 1 });
      second = result.current({ id: "A", x: 2 });
      third = result.current({ id: "A", x: 3 });
    });
    expect(calls).toEqual([{ id: "A", x: 1 }]);

    await act(async () => {
      settle();
      await first;
    });
    expect(calls).toEqual([{ id: "A", x: 1 }, { id: "A", x: 3 }]);
    await act(async () => {
      settle();
      await Promise.all([second, third]);
    });
    expect(calls).toHaveLength(2);
  });

  it("a write on another key is not delayed by an in-flight one", async () => {
    const { calls, mutation, settle } = deferredMutation();
    const { result } = renderHook(() => useSingleFlightMutation(mutation, (a: Args) => a.id));

    act(() => {
      void result.current({ id: "A", x: 1 });
      void result.current({ id: "B", x: 9 });
    });
    expect(calls).toEqual([{ id: "A", x: 1 }, { id: "B", x: 9 }]);
    settle();
    settle();
  });

  it("a failure on the in-flight write still lets the queued one go, and rejects the caller", async () => {
    const calls: Args[] = [];
    let fail = true;
    const mutation = (args: Args) => {
      calls.push(args);
      return fail ? Promise.reject(new Error("boom")) : Promise.resolve();
    };
    const { result } = renderHook(() => useSingleFlightMutation(mutation, (a: Args) => a.id));

    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = result.current({ id: "A", x: 1 });
      fail = false;
      second = result.current({ id: "A", x: 2 });
    });
    await expect(first).rejects.toThrow("boom");
    await second;
    expect(calls).toEqual([{ id: "A", x: 1 }, { id: "A", x: 2 }]);
  });

  it("keeps a stable identity across re-renders", () => {
    const { mutation } = deferredMutation();
    const { result, rerender } = renderHook(() => useSingleFlightMutation(mutation, (a: Args) => a.id));
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });
});
