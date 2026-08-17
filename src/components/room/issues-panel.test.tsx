/**
 * IssuesPanel — the Quick Vote switch consumes the game-flow decision it is
 * handed: denied renders the switch disabled with the decision's denial copy
 * (and no onClick that would let the backend throw); allowed keeps it live.
 * Convex reads/writes, toast, and the mobile branch are mocked at the seams;
 * the decision itself comes from the real computePermissions.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { computePermissions } from "@/hooks/usePermissions";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { Id } from "@/convex/_generated/dataModel";
import {
  denialMessage,
  RESOLVED_ALLOWED,
  type ResolvedDecision,
  type RoomPermissions,
} from "@/convex/permissions";

// Hoisted recorder shared with the (hoisted) vi.mock factories below.
const mocks = vi.hoisted(() => ({
  switchToQuickVote: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => () => Promise.resolve(undefined),
  useAction: () => () => Promise.resolve(undefined),
  useConvex: () => ({ query: () => Promise.resolve([]) }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

// Desktop branch of SidePanel — jsdom has no matchMedia.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("@/lib/toast", () => ({
  toast: { success: () => {}, error: () => {} },
}));

vi.mock("./hooks/useIssues", () => ({
  useIssues: () => ({
    issues: [],
    currentIssue: null,
    isQuickVoteMode: false,
    isLoading: false,
  }),
}));

vi.mock("./hooks/useIssueActions", () => ({
  useIssueActions: () => ({
    createIssue: () => Promise.resolve(undefined),
    startVoting: () => Promise.resolve(undefined),
    switchToQuickVote: mocks.switchToQuickVote,
    updateTitle: () => Promise.resolve(undefined),
    updateEstimate: () => Promise.resolve(undefined),
    deleteIssue: () => Promise.resolve(undefined),
  }),
}));

import { IssuesPanel } from "./issues-panel";

const allEveryone: RoomPermissions = {
  revealCards: "everyone",
  gameFlow: "everyone",
  issueManagement: "everyone",
  roomSettings: "everyone",
};

/** Minimal RoomWithRelatedData fixture — only the fields the mapping reads. */
function roomData(permissions: RoomPermissions): RoomWithRelatedData {
  return {
    room: { permissions },
    users: [{ _id: "u1", role: "participant" }],
    isOwnerAbsent: false,
  } as unknown as RoomWithRelatedData;
}

const GAME_FLOW_DENIAL = denialMessage(
  { kind: "category", category: "gameFlow", level: "facilitators" },
  "insufficient-role"
);

function renderPanel(canControlGameFlow: ResolvedDecision) {
  return render(
    <IssuesPanel
      roomId={"room-1" as Id<"rooms">}
      roomName="Test Room"
      isOpen={true}
      onClose={() => {}}
      canManageIssues={RESOLVED_ALLOWED}
      canControlGameFlow={canControlGameFlow}
    />
  );
}

afterEach(() => {
  cleanup();
  mocks.switchToQuickVote.mockClear();
});

describe("IssuesPanel — Quick Vote switch and the game-flow decision", () => {
  it("denied: disabled with the denial copy as tooltip, and no onClick that would throw", () => {
    const perms = computePermissions(
      roomData({ ...allEveryone, gameFlow: "facilitators" }),
      "u1"
    );
    expect(perms.gameFlow.allowed).toBe(false);

    renderPanel(perms.gameFlow);

    const quickVote = screen.getByRole("button", { name: GAME_FLOW_DENIAL });
    expect(quickVote).toHaveProperty("disabled", true);
    expect(quickVote.getAttribute("title")).toBe(GAME_FLOW_DENIAL);

    fireEvent.click(quickVote);
    expect(mocks.switchToQuickVote).not.toHaveBeenCalled();
  });

  it("allowed: the switch stays live and switching works", () => {
    renderPanel(RESOLVED_ALLOWED);

    const quickVote = screen.getByRole("button", { name: /quick vote/i });
    expect(quickVote).toHaveProperty("disabled", false);
    expect(quickVote.getAttribute("title")).toBeNull();

    fireEvent.click(quickVote);
    expect(mocks.switchToQuickVote).toHaveBeenCalledTimes(1);
  });
});
