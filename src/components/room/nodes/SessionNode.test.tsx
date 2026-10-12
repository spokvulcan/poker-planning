/**
 * SessionNode — control selection is one switch over the round's phase
 * (issue #227, user stories 1, 2, 4, 8). Each phase renders exactly one
 * action control; the regression guard pins the "revealed wins" rule: a
 * stray countdown timestamp must never animate a countdown over a settled
 * round. Every control reads the viewer's decision for its permission
 * category and asks the board's one actions object (#379).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { RESOLVED_ALLOWED } from "@/convex/permissions";
import type { PokerBoardActions, SessionNodeData, SessionNodeType } from "../types";
import { SessionNode } from "./SessionNode";

const EVERYTHING_ALLOWED = {
  revealCards: RESOLVED_ALLOWED,
  gameFlow: RESOLVED_ALLOWED,
  issueManagement: RESOLVED_ALLOWED,
  roomSettings: RESOLVED_ALLOWED,
};

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

function makeData(overrides: Partial<SessionNodeData> = {}): SessionNodeData {
  return {
    sessionName: "Planning Session",
    participantCount: 3,
    voteCount: 2,
    phase: "voting",
    hasVotes: true,
    autoCompleteVoting: true,
    autoRevealCountdownStartedAt: null,
    currentIssue: null,
    timeNodes: { timer: true, sessionTime: false },
    permissions: EVERYTHING_ALLOWED,
    actions: boardActions(),
    ...overrides,
  };
}

function sessionNode(data: SessionNodeData) {
  return (
    <ReactFlowProvider>
      <SessionNode
        {...({ id: "session-current", data } as NodeProps<SessionNodeType>)}
      />
    </ReactFlowProvider>
  );
}

function renderSession(data: SessionNodeData) {
  return render(sessionNode(data));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SessionNode — one action control per phase", () => {
  it("voting: renders the reveal control", () => {
    renderSession(makeData({ phase: "voting" }));
    expect(screen.getByRole("button", { name: /reveal all votes/i })).toBeDefined();
    expect(screen.queryByText(/tap to cancel/i)).toBeNull();
    expect(screen.queryByText(/new round/i)).toBeNull();
  });

  it("countingDown: renders the cancel-countdown control", () => {
    renderSession(
      makeData({
        phase: "countingDown",
        autoRevealCountdownStartedAt: Date.now(),
      }),
    );
    expect(screen.getByText(/tap to cancel/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /reveal all votes/i })).toBeNull();
    expect(screen.queryByText(/new round/i)).toBeNull();
  });

  it("revealed: renders the new-round control", () => {
    renderSession(makeData({ phase: "revealed" }));
    expect(
      screen.getByRole("button", { name: /start a new voting round/i }),
    ).toBeDefined();
    expect(screen.queryByText(/tap to cancel/i)).toBeNull();
  });

  it("revealed with a stray countdown timestamp still renders the revealed state", () => {
    // The exact drift this consolidation removes: `revealed` must win even if
    // a stale countdown anchor lingers on the wire — no countdown may render
    // or tick over settled results.
    vi.useFakeTimers();
    renderSession(
      makeData({
        phase: "revealed",
        autoRevealCountdownStartedAt: Date.now() - 1000,
      }),
    );

    expect(
      screen.getByRole("button", { name: /start a new voting round/i }),
    ).toBeDefined();
    expect(screen.queryByText(/tap to cancel/i)).toBeNull();

    // Let any (wrongly) armed ticking interval fire: still no countdown.
    vi.advanceTimersByTime(1000);
    expect(screen.queryByText(/tap to cancel/i)).toBeNull();
  });
});

describe("SessionNode — the board's actions and the viewer's decisions", () => {
  it("asks the board's actions for what each control does", () => {
    const actions = boardActions();
    renderSession(makeData({ phase: "voting", actions }));

    fireEvent.click(screen.getByRole("button", { name: /reveal all votes/i }));
    fireEvent.click(screen.getByRole("button", { name: /open issues panel/i }));
    fireEvent.click(screen.getByRole("button", { name: /auto-reveal when all vote/i }));

    expect(actions.reveal).toHaveBeenCalledTimes(1);
    expect(actions.openIssues).toHaveBeenCalledTimes(1);
    expect(actions.setAutoComplete).toHaveBeenCalledTimes(1);
  });

  it.each([
    [true, false],
    [false, true],
  ])("the auto-reveal toggle showing %s asks for %s, whatever the server holds by now", (shown, chosen) => {
    const actions = boardActions();
    renderSession(makeData({ autoCompleteVoting: shown, actions }));

    fireEvent.click(screen.getByRole("button", { name: /auto-reveal when all vote/i }));

    expect(actions.setAutoComplete).toHaveBeenCalledWith(chosen);
  });

  it("keeps a control the viewer may not use disabled, and says why", () => {
    const actions = boardActions();
    const denied = { allowed: false as const, message: "Only facilitators and the owner can reveal cards." };
    renderSession(makeData({ permissions: { ...EVERYTHING_ALLOWED, revealCards: denied }, actions }));

    const reveal = screen.getByRole("button", { name: denied.message }) as HTMLButtonElement;
    fireEvent.click(reveal);

    expect(reveal.disabled).toBe(true);
    expect(actions.reveal).not.toHaveBeenCalled();
  });
});

/**
 * New Round takes the place of the control that settled the round, so a
 * second click meant for Reveal (a double-click, or a tap on Cancel as the
 * countdown ends) would land on it and wipe the results. It holds for a few
 * seconds after the round settles under the viewer's eyes.
 */
describe("SessionNode — New Round holds after the round settles", () => {
  function passSeconds(seconds: number) {
    for (let i = 0; i < seconds; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
  }

  it("ignores a click that lands just after the reveal, then starts a round", () => {
    vi.useFakeTimers();
    const actions = boardActions();
    const { rerender } = renderSession(makeData({ phase: "voting", actions }));

    rerender(sessionNode(makeData({ phase: "revealed", actions })));
    fireEvent.click(screen.getByRole("button", { name: /please wait/i }));
    expect(actions.reset).not.toHaveBeenCalled();

    passSeconds(3);
    fireEvent.click(screen.getByRole("button", { name: /start a new voting round/i }));
    expect(actions.reset).toHaveBeenCalledTimes(1);
  });

  it("holds when the countdown reveals the round under a tap meant for Cancel", () => {
    vi.useFakeTimers();
    const actions = boardActions();
    const { rerender } = renderSession(
      makeData({ phase: "countingDown", autoRevealCountdownStartedAt: Date.now(), actions }),
    );

    rerender(sessionNode(makeData({ phase: "revealed", actions })));
    fireEvent.click(screen.getByRole("button", { name: /please wait/i }));

    expect(actions.reset).not.toHaveBeenCalled();
  });

  it("starts a round at once for a viewer who arrives to it already revealed", () => {
    const actions = boardActions();
    renderSession(makeData({ phase: "revealed", actions }));

    fireEvent.click(screen.getByRole("button", { name: /start a new voting round/i }));

    expect(actions.reset).toHaveBeenCalledTimes(1);
  });
});

describe("SessionNode — the time nodes' menu", () => {
  it("right-click shows and hides the timer and session time for the room", async () => {
    const actions = boardActions();
    renderSession(makeData({ actions, timeNodes: { timer: true, sessionTime: false } }));

    fireEvent.contextMenu(screen.getByText("Planning Session"));
    const timer = await screen.findByRole("menuitemcheckbox", { name: "Timer" });
    const sessionTime = screen.getByRole("menuitemcheckbox", { name: "Session time" });
    expect(timer.getAttribute("aria-checked")).toBe("true");
    expect(sessionTime.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(sessionTime);
    expect(actions.setTimeNodeShown).toHaveBeenCalledWith("sessionTime", true);
  });

  it("leaves the switches to whoever may change the room's settings", async () => {
    const denied = { allowed: false as const, message: "Only facilitators can change room settings" };
    renderSession(makeData({ permissions: { ...EVERYTHING_ALLOWED, roomSettings: denied } }));

    fireEvent.contextMenu(screen.getByText("Planning Session"));
    expect((await screen.findByRole("menuitemcheckbox", { name: "Timer" })).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(denied.message)).toBeDefined();
  });
});
