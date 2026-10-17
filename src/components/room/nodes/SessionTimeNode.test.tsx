import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { api } from "@/convex/_generated/api";
import { RESOLVED_ALLOWED } from "@/convex/permissions";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoundClockView } from "@/convex/roundTime";
import { resetConvex, serve } from "@/components/whiteboard/testing/convex";
import type { PokerBoardActions, SessionTimeNodeType, TimeNodeData } from "../types";
import { SessionTimeNode } from "./SessionTimeNode";

vi.mock("convex/react", async (importOriginal) =>
  (await import("@/components/whiteboard/testing/convex")).mockConvexReact(await importOriginal<object>()),
);

// Session time (ADR-0032): the session's total, what it was spent on, and
// its breaks, read from the round clock's facts as the server serves them.

const MIN = 60_000;
const NOW = 1_800_000_000_000;
const START = NOW - 60 * MIN;
const roomId = "room-1" as Id<"rooms">;

function renderSessionTime(clock: RoundClockView, lastActivityAt = NOW) {
  serve(api.roundClock.get, { roomId }, clock);
  const actions = { setTimeNodeShown: vi.fn() } as unknown as PokerBoardActions;
  const data: TimeNodeData = {
    roomId,
    lastActivityAt,
    permissions: { gameFlow: RESOLVED_ALLOWED, roomSettings: RESOLVED_ALLOWED },
    actions,
  };
  const { container } = render(
    <ReactFlowProvider>
      <SessionTimeNode {...({ id: "session-time", data } as NodeProps<SessionTimeNodeType>)} />
    </ReactFlowProvider>,
  );
  return { actions, container };
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

const ticket = {
  issueId: "i1" as Id<"issues">,
  title: "Checkout flow",
  rounds: [{ startedAt: START, votingEndedAt: START + 2 * MIN, revealedAt: START + 2 * MIN, endedAt: START + 20 * MIN }],
};

beforeEach(() => {
  resetConvex();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SessionTimeNode", () => {
  it("totals the session's tickets and rounds, and its breaks, apart", () => {
    renderSessionTime({
      ...empty,
      items: [ticket, { rounds: [{ startedAt: START + 20 * MIN, endedAt: START + 25 * MIN, votingEndedAt: START + 25 * MIN }] }],
      breaks: [{ from: START + 5 * MIN, to: START + 17 * MIN, kind: "away" }],
    });

    // 20 minutes on the ticket less the 12-minute break, then a 5-minute round.
    expect(screen.getByText("13:00")).toBeDefined();
    expect(screen.getByText(/1 ticket · 1 round/)).toBeDefined();
    expect(screen.getByText("12:00")).toBeDefined();
  });

  it("marks the item the room is on, even while it has counted no time yet", () => {
    const { container } = renderSessionTime(
      { ...empty, items: [ticket, { rounds: [{ startedAt: NOW - 5 * MIN }] }], pausedAt: NOW - 5 * MIN },
      NOW - 5 * MIN,
    );

    const open = container.querySelectorAll("[data-open]");
    expect(open).toHaveLength(1);
    expect(open[0].parentElement?.lastElementChild).toBe(open[0]);
    expect(screen.getByText(/1 ticket · 1 round/)).toBeDefined();
  });

  it("says when the room is paused", () => {
    renderSessionTime({ ...empty, pausedAt: NOW - MIN });
    expect(screen.getByText("Paused")).toBeDefined();
  });

  it("hides itself for the room from its right-click menu", async () => {
    const { actions } = renderSessionTime(empty);
    fireEvent.contextMenu(screen.getByText("Session"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Hide session time" }));
    expect(actions.setTimeNodeShown).toHaveBeenCalledWith("sessionTime", false);
  });
});
