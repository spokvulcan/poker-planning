/**
 * The stage pill (spec §7): the shared stage's label, and the advisory
 * timebox counting down from the entry's minutes and the entered-at
 * instant, reading "Timebox over" at zero and nothing else.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { StagePill } from "./stage-pill";
import { STAGE_LABELS, TIMEBOX_OVER } from "@/convex/retroCopy";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("StagePill", () => {
  it("shows the label and no countdown when the entry has no timebox", () => {
    render(<StagePill kind="group" />);
    expect(screen.getByTestId("stage-pill").textContent).toBe(STAGE_LABELS.group);
    expect(screen.queryByTestId("timebox")).toBeNull();
  });

  it("counts down from the entry's minutes since the entered-at instant, then reads Timebox over", () => {
    vi.useFakeTimers();
    const enteredAt = Date.UTC(2026, 8, 5, 10, 0, 0);
    vi.setSystemTime(enteredAt + 30_000);
    render(<StagePill kind="vote" timeboxMinutes={5} enteredAt={enteredAt} />);
    const timebox = screen.getByTestId("timebox");
    expect(timebox.textContent).toBe("4:30");
    expect(timebox.getAttribute("data-over")).toBe("false");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId("timebox").textContent).toBe("3:30");

    act(() => {
      vi.advanceTimersByTime(4 * 60_000);
    });
    expect(screen.getByTestId("timebox").textContent).toBe(TIMEBOX_OVER);
    expect(screen.getByTestId("timebox").getAttribute("data-over")).toBe("true");
    // The pill still names the stage: nothing advanced.
    expect(screen.getByTestId("stage-pill").getAttribute("data-stage")).toBe("vote");
  });
});
