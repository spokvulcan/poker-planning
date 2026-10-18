import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { api } from "@/convex/_generated/api";
import { RESOLVED_ALLOWED } from "@/convex/permissions";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoundClockView } from "@/convex/roundTime";
import { resetConvex, serve } from "@/components/whiteboard/testing/convex";
import type { PokerBoardActions, RoundTimerNodeType, TimeNodeData } from "../types";
import { RoundTimerNode } from "./RoundTimerNode";

vi.mock("convex/react", async (importOriginal) =>
  (await import("@/components/whiteboard/testing/convex")).mockConvexReact(await importOriginal<object>()),
);

// The poker board's timer (ADR-0032): what it shows in each of its states,
// read from the round clock's facts as the server serves them, and which
// writes its controls make.

const NOW = 1_800_000_000_000;
const roomId = "room-1" as Id<"rooms">;

function view(over: Partial<RoundClockView> = {}): RoundClockView {
  return {
    sessionStartedAt: NOW - 60 * 60_000,
    pausedAt: null,
    timebox: null,
    timeboxMs: 120_000,
    current: [{ startedAt: NOW - 65_000 }],
    items: [],
    breaks: [],
    ...over,
  };
}

function boardActions(): PokerBoardActions {
  return {
    reveal: vi.fn(),
    reset: vi.fn(),
    setAutoComplete: vi.fn(),
    cancelAutoReveal: vi.fn(),
    selectCard: vi.fn(),
    openIssues: vi.fn(),
    updateNoteContent: vi.fn(async () => true),
    deleteNote: vi.fn(),
    startTimebox: vi.fn(),
    extendTimebox: vi.fn(),
    stopTimebox: vi.fn(),
    pauseClock: vi.fn(),
    resumeClock: vi.fn(),
    setTimeNodeShown: vi.fn(),
  };
}

function renderTimer(clock: RoundClockView, over: Partial<TimeNodeData> = {}) {
  serve(api.roundClock.get, { roomId }, clock);
  const data: TimeNodeData = {
    roomId,
    lastActivityAt: NOW - 1_000,
    permissions: { gameFlow: RESOLVED_ALLOWED, roomSettings: RESOLVED_ALLOWED },
    actions: boardActions(),
    ...over,
  };
  render(
    <ReactFlowProvider>
      <RoundTimerNode {...({ id: "timer", data } as NodeProps<RoundTimerNodeType>)} />
    </ReactFlowProvider>,
  );
  return data.actions;
}

const shown = () => screen.getByRole("timer").textContent;

/** The browser's clock ticks on fake timers, so a test can let time pass. */
function ticking(): void {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "setInterval"] });
  vi.setSystemTime(NOW);
}

function pass(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  resetConvex();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RoundTimerNode", () => {
  it("shows how long the current ticket has taken, and nothing about the ticket itself", () => {
    renderTimer(view());
    expect(shown()).toContain("1:05");
  });

  it("keeps counting as the round runs, and holds while the room is paused for a break", () => {
    ticking();
    renderTimer(view(), { lastActivityAt: NOW });
    pass(60_000);
    expect(shown()).toContain("2:05");

    act(() => serve(api.roundClock.get, { roomId }, view({ pausedAt: Date.now() })));
    pass(5 * 60_000);
    expect(shown()).toContain("2:05");
    expect(screen.getByText("Paused for a break")).toBeDefined();
  });

  it("leaves out the quiet once nobody has done anything for twenty minutes", () => {
    renderTimer(view({ current: [{ startedAt: NOW - 40 * 60_000 }] }), { lastActivityAt: NOW - 30 * 60_000 });
    // Ten minutes' work, then the first twenty minutes of the quiet; the rest is left out.
    expect(shown()).toContain("30:00");
  });

  it("waits for a round to start: nothing counts until one opens", () => {
    ticking();
    renderTimer(view({ current: [] }), { lastActivityAt: NOW });
    pass(60_000);
    expect(shown()).toContain("0:00");
  });

  it("flips a timebox of the room's last length from the hourglass", () => {
    const actions = renderTimer(view({ timeboxMs: 180_000 }));
    fireEvent.click(screen.getByRole("button", { name: "Start a 3:00 timebox" }));
    expect(actions.startTimebox).toHaveBeenCalledWith(180_000);
  });

  it("counts a running timebox down, adds a minute, and stops when its glass is clicked", () => {
    const actions = renderTimer(view({ timebox: { startedAt: NOW - 30_000, durationMs: 120_000 } }));
    expect(shown()).toContain("1:30");

    fireEvent.click(screen.getByRole("button", { name: "Add a minute" }));
    expect(actions.extendTimebox).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stop the timebox" }));
    expect(actions.stopTimebox).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /close|put away/i })).toBeNull();
  });

  it("counts how far over a timebox is once its sand has run, and flips it again", () => {
    const actions = renderTimer(view({ timebox: { startedAt: NOW - 150_000, durationMs: 120_000 } }));
    expect(shown()).toContain("+0:30");

    fireEvent.click(screen.getByRole("button", { name: "Flip again" }));
    expect(actions.startTimebox).toHaveBeenCalledWith(120_000);
  });

  it("says when the room paused for a break, and resumes", () => {
    const actions = renderTimer(view({ pausedAt: NOW - 10_000 }));
    expect(screen.getByText("Paused for a break")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(actions.resumeClock).toHaveBeenCalled();
  });

  it("leaves the timebox to whoever may run the room's game flow", () => {
    const denied = { allowed: false as const, message: "Only facilitators can run the game" };
    renderTimer(view(), { permissions: { gameFlow: denied, roomSettings: RESOLVED_ALLOWED } });
    expect((screen.getByRole("button", { name: denied.message }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers the lengths, the pause and hiding on right-click", async () => {
    const actions = renderTimer(view());
    fireEvent.contextMenu(screen.getByRole("timer"));

    fireEvent.click(await screen.findByRole("menuitemradio", { name: "5-minute timebox" }));
    expect(actions.startTimebox).toHaveBeenCalledWith(300_000);

    fireEvent.contextMenu(screen.getByRole("timer"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Hide timer" }));
    expect(actions.setTimeNodeShown).toHaveBeenCalledWith("timer", false);
  });
});
