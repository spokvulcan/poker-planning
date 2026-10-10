/**
 * SessionNode — control selection is one switch over the round's phase
 * (issue #227, user stories 1, 2, 4, 8). Each phase renders exactly one
 * action control; the regression guard pins the "revealed wins" rule: a
 * stray countdown timestamp must never animate a countdown over a settled
 * round. Every control reads the viewer's decision for its permission
 * category and asks the board's one actions object (#379).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
    toggleAutoComplete: vi.fn(),
    cancelAutoReveal: vi.fn(),
    selectCard: vi.fn(),
    openIssues: vi.fn(),
    updateNoteContent: vi.fn(async () => true),
    deleteNote: vi.fn(),
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
    permissions: EVERYTHING_ALLOWED,
    actions: boardActions(),
    ...overrides,
  };
}

function renderSession(data: SessionNodeData) {
  return render(
    <ReactFlowProvider>
      <SessionNode
        {...({ id: "session-current", data } as NodeProps<SessionNodeType>)}
      />
    </ReactFlowProvider>,
  );
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
    expect(actions.toggleAutoComplete).toHaveBeenCalledTimes(1);
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
