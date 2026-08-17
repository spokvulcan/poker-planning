/**
 * useStableActions — the one frozen-identity mechanism shared by the *Actions
 * seams. Tested generically (no Convex, no demo context): the object and each
 * method keep referential identity across re-renders, and each stable method
 * forwards its arguments to — and returns the result of — the latest render's
 * closure. The seams' own tests pin the same contracts through their real
 * interfaces (demo no-op included).
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStableActions } from "./useStableActions";

interface CounterActions {
  increment: (by: number) => number;
  read: () => number;
}

describe("useStableActions", () => {
  it("keeps the actions object and every method stable across re-renders", () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useStableActions<CounterActions>({
          increment: (by) => count + by,
          read: () => count,
        }),
      { initialProps: { count: 0 } },
    );

    const first = result.current;
    const firstMethods = { ...first };

    // Re-render with no change, then with a changed input.
    rerender({ count: 1 });
    rerender({ count: 2 });

    expect(result.current).toBe(first);
    for (const key of Object.keys(firstMethods) as (keyof CounterActions)[]) {
      expect(result.current[key]).toBe(firstMethods[key]);
    }
  });

  it("invokes the latest closure, forwarding args and returning its result", () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useStableActions<CounterActions>({
          increment: (by) => count + by,
          read: () => count,
        }),
      { initialProps: { count: 0 } },
    );

    // First render's closure sees count = 0.
    expect(result.current.increment(2)).toBe(2);

    // After a re-render the same stable method runs the latest closure.
    rerender({ count: 5 });
    expect(result.current.increment(2)).toBe(7);
    expect(result.current.read()).toBe(5);
  });
});
