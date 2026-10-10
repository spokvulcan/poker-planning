/**
 * The features page's animations play through the looping scene: with
 * reduced motion each holds the frame it plays to last, and none leaves
 * anything running once it unmounts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ComponentType } from "react";
import * as animations from "./feature-animations";

const ANIMATIONS = Object.entries(animations) as [string, ComponentType][];

/** The visitor's motion setting; jsdom has no media queries of its own. */
function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" && reduce,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** Plays an animation until it starts over: the markup it showed just before is its final frame. */
async function finalFrameOf(Animation: ComponentType) {
  const { container, unmount } = render(<Animation />);
  const first = container.innerHTML;
  let last = first;
  for (let frame = 0; frame < 100; frame++) {
    await act(() => vi.advanceTimersToNextTimerAsync());
    if (container.innerHTML === first) {
      unmount();
      return last;
    }
    last = container.innerHTML;
  }
  throw new Error("never started over");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each(ANIMATIONS)("%s", (_name, Animation) => {
  it("holds its final frame when the visitor prefers reduced motion", async () => {
    preferReducedMotion(false);
    const final = await finalFrameOf(Animation);

    preferReducedMotion(true);
    const { container } = render(<Animation />);
    expect(container.innerHTML).toBe(final);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(container.innerHTML).toBe(final);
  });

  it("leaves nothing running once unmounted", async () => {
    preferReducedMotion(false);
    const { unmount } = render(<Animation />);
    await act(() => vi.advanceTimersByTimeAsync(1_000));

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
