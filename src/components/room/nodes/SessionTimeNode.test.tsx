import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { RESOLVED_ALLOWED } from "@/convex/permissions";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoundClockView } from "@/convex/model/roundClock";
import type { RoundClockReading } from "../hooks/use-round-clock";
import type { PokerBoardActions, SessionTimeNodeType, TimeNodeData } from "../types";
import { SessionTimeNode } from "./SessionTimeNode";

// Session time (ADR-0032): the session's total, what it was spent on, and
// its breaks, read from a round clock the test sets.

const MIN = 60_000;
const NOW = 1_800_000_000_000;
const START = NOW - 60 * MIN;
let reading: RoundClockReading;
vi.mock("../hooks/use-round-clock", () => ({ useRoundClock: () => reading }));

function renderSessionTime(clock: RoundClockView) {
  reading = { view: clock, now: NOW, breaks: clock.breaks };
  const actions = { setTimeNodeShown: vi.fn() } as unknown as PokerBoardActions;
  const data: TimeNodeData = {
    roomId: "room-1" as Id<"rooms">,
    lastActivityAt: NOW,
    permissions: { gameFlow: RESOLVED_ALLOWED, roomSettings: RESOLVED_ALLOWED },
    actions,
  };
  render(
    <ReactFlowProvider>
      <SessionTimeNode {...({ id: "session-time", data } as NodeProps<SessionTimeNodeType>)} />
    </ReactFlowProvider>,
  );
  return actions;
}

const empty: RoundClockView = {
  sessionStartedAt: START,
  pausedAt: null,
  timebox: null,
  timeboxMs: 2 * MIN,
  current: [],
  items: [],
  breaks: [],
};

afterEach(cleanup);

describe("SessionTimeNode", () => {
  it("totals the session's tickets and rounds, and its breaks, apart", () => {
    renderSessionTime({
      ...empty,
      items: [
        {
          issueId: "i1" as Id<"issues">,
          title: "Checkout flow",
          rounds: [{ startedAt: START, votingEndedAt: START + 2 * MIN, revealedAt: START + 2 * MIN, endedAt: START + 20 * MIN }],
        },
        { rounds: [{ startedAt: START + 20 * MIN, endedAt: START + 25 * MIN, votingEndedAt: START + 25 * MIN }] },
      ],
      breaks: [{ from: START + 5 * MIN, to: START + 17 * MIN, kind: "away" }],
    });

    // 20 minutes on the ticket less the 12-minute break, then a 5-minute round.
    expect(screen.getByText("13:00")).toBeDefined();
    expect(screen.getByText(/1 ticket · 1 round/)).toBeDefined();
    expect(screen.getByText("12:00")).toBeDefined();
  });

  it("says when the room is paused", () => {
    renderSessionTime({ ...empty, pausedAt: NOW - MIN });
    expect(screen.getByText("Paused")).toBeDefined();
  });

  it("hides itself for the room from its right-click menu", async () => {
    const actions = renderSessionTime(empty);
    fireEvent.contextMenu(screen.getByText("Session"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Hide session time" }));
    expect(actions.setTimeNodeShown).toHaveBeenCalledWith("sessionTime", false);
  });
});
