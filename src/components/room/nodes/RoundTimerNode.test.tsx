import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { RESOLVED_ALLOWED } from "@/convex/permissions";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoundClockView } from "@/convex/model/roundClock";
import type { RoundClockReading } from "../hooks/use-round-clock";
import type { PokerBoardActions, RoundTimerNodeType, TimeNodeData } from "../types";
import { RoundTimerNode } from "./RoundTimerNode";

// The poker board's timer (ADR-0032): what it shows in each of its states,
// read from a round clock the test sets, and which writes its controls make.

const NOW = 1_800_000_000_000;
let reading: RoundClockReading;
vi.mock("../hooks/use-round-clock", () => ({ useRoundClock: () => reading }));

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
    toggleAutoComplete: vi.fn(),
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
  reading = { view: clock, now: NOW, breaks: clock.breaks };
  const data: TimeNodeData = {
    roomId: "room-1" as Id<"rooms">,
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

beforeEach(() => {
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
    expect(screen.getByRole("timer").textContent).toContain("1:05");
  });

  it("flips a timebox of the room's last length from the hourglass", () => {
    const actions = renderTimer(view({ timeboxMs: 180_000 }));
    fireEvent.click(screen.getByRole("button", { name: "Start a 3:00 timebox" }));
    expect(actions.startTimebox).toHaveBeenCalledWith(180_000);
  });

  it("counts a running timebox down, adds a minute, and stops when its glass is clicked", () => {
    const actions = renderTimer(view({ timebox: { startedAt: NOW - 30_000, durationMs: 120_000 } }));
    expect(screen.getByRole("timer").textContent).toContain("1:30");

    fireEvent.click(screen.getByRole("button", { name: "Add a minute" }));
    expect(actions.extendTimebox).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stop the timebox" }));
    expect(actions.stopTimebox).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /close|put away/i })).toBeNull();
  });

  it("counts how far over a timebox is once its sand has run, and flips it again", () => {
    const actions = renderTimer(view({ timebox: { startedAt: NOW - 150_000, durationMs: 120_000 } }));
    expect(screen.getByRole("timer").textContent).toContain("+0:30");

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
