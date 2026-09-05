/**
 * The room page's retro branch (spec §18.1, ADR-0009): never auto-joins (it
 * holds no join mutation at all); shows the retro join form to a visitor
 * without a membership or Team access, with the Team's name for the copy;
 * lets a Team member who never joined read the board with a line offering
 * to join; mounts the board with its menu for an attendee.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  join: vi.fn(),
  mutations: [] as { fn: string; args: unknown }[],
  presenceCalls: [] as unknown[][],
  auth: { authUserId: "auth-1", isLoading: false, isAuthenticated: true, accountType: "anonymous" as string },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    retro: { board: "retro.board", advance: "retro.advance", setCardsVisible: "retro.setCardsVisible", setTimebox: "retro.setTimebox" },
    teams: { listMine: "teams.listMine" },
    presence: { setReadiness: "presence.setReadiness" },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: string, args: unknown) => (args === "skip" ? undefined : mocks.queries[ref]),
  useMutation: (ref: string) => async (args: unknown) => {
    mocks.mutations.push({ fn: ref, args });
  },
}));
vi.mock("@convex-dev/presence/react", () => ({
  default: (...args: unknown[]) => {
    mocks.presenceCalls.push(args);
    return [{ userId: "user1", online: true, lastDisconnected: 0 }];
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/components/retro/retro-join-form", () => ({
  RetroJoinForm: ({ roomName, teamName, isTeamMember }: { roomName: string; teamName?: string; isTeamMember: boolean }) => (
    <div data-testid="join-form" data-team={teamName} data-team-member={String(isTeamMember)}>
      {roomName}
    </div>
  ),
}));
vi.mock("@/components/retro/retro-board", () => ({
  RetroBoard: ({ retro, team, menu, banner, viewer }: { retro: { currentStageId: string }; team?: { name: string }; menu?: React.ReactNode; banner?: React.ReactNode; viewer?: { userId: string; onSetReady: (ready: boolean) => void; controls: { onAdvance: (id: string) => void; stageFlow: { allowed: boolean } } } }) => (
    <div data-testid="board" data-team={team?.name} data-viewer={viewer?.userId} data-stage-flow={String(viewer?.controls.stageFlow.allowed)}>
      {retro.currentStageId}
      {menu}
      {banner}
      {viewer && <button onClick={() => viewer.onSetReady(true)}>ready</button>}
      {viewer && <button onClick={() => viewer.controls.onAdvance("s2")}>advance</button>}
    </div>
  ),
}));
vi.mock("@/components/retro/retro-menu", () => ({
  RetroMenu: ({ role, settings }: { role: string; settings?: { name: string; decision: { allowed: boolean } } }) => (
    <div data-testid="menu" data-settings={settings?.name} data-settings-allowed={String(settings?.decision.allowed)}>{role}</div>
  ),
}));

import { RetroRoomContent } from "./retro-room-content";
import type { Id } from "@/convex/_generated/dataModel";

const roomId = "room1" as Id<"rooms">;
const teamless = {
  room: { _id: roomId, name: "Sprint 12", roomType: "retro", joinPolicy: "anyone" },
  users: [{ _id: "user1", role: "owner" }],
  votes: [],
  isOwnerAbsent: false,
} as never;
const teamed = {
  room: { _id: roomId, name: "Sprint 12", roomType: "retro", joinPolicy: "teamMembers", teamId: "team-1" },
  users: [],
  votes: [],
  isOwnerAbsent: false,
  teamName: "Acme Squad",
} as never;

beforeEach(() => {
  mocks.join.mockReset();
  mocks.mutations = [];
  mocks.presenceCalls = [];
  mocks.auth.accountType = "anonymous";
  mocks.queries = {
    "retro.board": { currentStageId: "s1", stages: [{ id: "s1", kind: "collect" }, { id: "s2", kind: "group" }] },
    "teams.listMine": [],
  };
});
afterEach(cleanup);

describe("RetroRoomContent", () => {
  it("shows the join form to a visitor without a membership, and never auto-joins", async () => {
    render(<RetroRoomContent roomId={roomId} roomData={teamless} membership={null} />);
    expect(screen.getByTestId("join-form").textContent).toBe("Sprint 12");
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.join).not.toHaveBeenCalled();
    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("hands the join form the Team's name and whether the visitor is in it; an anonymous visitor never reads Teams", () => {
    mocks.queries["teams.listMine"] = undefined;
    render(<RetroRoomContent roomId={roomId} roomData={teamed} membership={null} />);
    const form = screen.getByTestId("join-form");
    expect(form.getAttribute("data-team")).toBe("Acme Squad");
    expect(form.getAttribute("data-team-member")).toBe("false");
  });

  it("mounts the board with the menu and the viewer's role once a membership exists", () => {
    render(<RetroRoomContent roomId={roomId} roomData={teamless} membership={{ _id: "user1" as never }} />);
    expect(screen.getByTestId("board").textContent).toContain("s1");
    expect(screen.getByTestId("menu").textContent).toBe("owner");
    expect(screen.getByTestId("menu").getAttribute("data-settings")).toBe("Sprint 12");
    expect(screen.getByTestId("menu").getAttribute("data-settings-allowed")).toBe("true");
    expect(screen.queryByTestId("join-form")).toBeNull();
    expect(screen.queryByTestId("team-reader-banner")).toBeNull();
  });

  it("an attendee heartbeats as themselves, writes readiness keyed to the shared entry, and holds the stageFlow decision", async () => {
    render(<RetroRoomContent roomId={roomId} roomData={teamless} membership={{ _id: "user1" as never }} />);
    expect(mocks.presenceCalls[0]?.slice(1)).toEqual([roomId, "user1"]);
    const board = screen.getByTestId("board");
    expect(board.getAttribute("data-viewer")).toBe("user1");
    expect(board.getAttribute("data-stage-flow")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "ready" }));
    fireEvent.click(screen.getByRole("button", { name: "advance" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.mutations).toEqual([
      { fn: "presence.setReadiness", args: { roomId, userId: "user1", stageId: "s1", ready: true } },
      { fn: "retro.advance", args: { roomId, toStageId: "s2" } },
    ]);
  });

  it("a Team member who never joined reads the board with no menu, and joins only on their own click", async () => {
    mocks.auth.accountType = "permanent";
    mocks.queries["teams.listMine"] = [{ _id: "team-1", name: "Acme Squad", role: "member" }];
    render(<RetroRoomContent roomId={roomId} roomData={teamed} membership={null} />);
    const board = screen.getByTestId("board");
    expect(board.getAttribute("data-team")).toBe("Acme Squad");
    expect(screen.queryByTestId("menu")).toBeNull();
    expect(screen.queryByTestId("join-form")).toBeNull();
    expect(screen.getByTestId("team-reader-banner").textContent).toContain("member of Acme Squad");
    // No attendance, no heartbeat: the presence hook never mounts.
    expect(mocks.presenceCalls).toEqual([]);
    expect(board.getAttribute("data-viewer")).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.join).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Join retro" }));
    expect(screen.getByTestId("join-form").getAttribute("data-team-member")).toBe("true");
  });

  it("waits for the Teams read before deciding a permanent account is not a Team member", () => {
    mocks.auth.accountType = "permanent";
    mocks.queries["teams.listMine"] = undefined;
    render(<RetroRoomContent roomId={roomId} roomData={teamed} membership={null} />);
    expect(screen.queryByTestId("join-form")).toBeNull();
    expect(screen.queryByTestId("board")).toBeNull();
  });
});
