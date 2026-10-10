/**
 * useLoopingScene: a marketing animation's scene shows its frames in order,
 * each for its hold, and starts over; unmounting stops it; a visitor who
 * prefers reduced motion sees the final frame, held.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useLoopingScene, type Scene } from "./use-looping-scene";

/** Creating a room in three frames. */
const CREATE: Scene<string> = [
  { show: "typed", hold: 800 },
  { show: "pressed", hold: 150 },
  { show: "created", hold: 2500 },
];

function Animation({ scene }: { scene: Scene<string> }) {
  return <output aria-label="frame">{useLoopingScene(scene)}</output>;
}

const shown = () => screen.getByLabelText("frame").textContent;
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** The visitor's motion setting; jsdom has no media queries of its own. */
function motionSetting(reduce: boolean) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(prefers-reduced-motion: reduce)" && reduce;
    },
    addEventListener: (_type: "change", listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: "change", listener: () => void) => listeners.delete(listener),
  }));
  return {
    change(next: boolean) {
      reduce = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a looping scene", () => {
  it("shows each frame for its hold, in order", () => {
    motionSetting(false);
    render(<Animation scene={CREATE} />);
    expect(shown()).toBe("typed");

    wait(799);
    expect(shown()).toBe("typed");
    wait(1);
    expect(shown()).toBe("pressed");
    wait(150);
    expect(shown()).toBe("created");
  });

  it("starts over once the final frame's hold is up", () => {
    motionSetting(false);
    render(<Animation scene={CREATE} />);

    wait(800 + 150 + 2499);
    expect(shown()).toBe("created");
    wait(1);
    expect(shown()).toBe("typed");
    wait(800);
    expect(shown()).toBe("pressed");
  });

  it("leaves nothing running once unmounted", () => {
    motionSetting(false);
    const { unmount } = render(<Animation scene={CREATE} />);
    wait(900);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("with reduced motion", () => {
  it("shows the final frame and holds it", () => {
    motionSetting(true);
    render(<Animation scene={CREATE} />);
    expect(shown()).toBe("created");

    wait(60_000);
    expect(shown()).toBe("created");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("turned on mid-scene, jumps to the final frame and stays there", () => {
    const setting = motionSetting(false);
    render(<Animation scene={CREATE} />);
    wait(800);
    expect(shown()).toBe("pressed");

    setting.change(true);
    expect(shown()).toBe("created");
    wait(60_000);
    expect(shown()).toBe("created");
    expect(vi.getTimerCount()).toBe(0);
  });
});
