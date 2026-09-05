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
  auth: { authUserId: "auth-1", isLoading: false, isAuthenticated: true, accountType: "anonymous" as string },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { retro: { board: "retro.board" }, teams: { listMine: "teams.listMine" } },
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: string, args: unknown) => (args === "skip" ? undefined : mocks.queries[ref]),
  useMutation: () => mocks.join,
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/components/retro/retro-join-form", () => ({
  RetroJoinForm: ({ roomName, teamName, isTeamMember }: { roomName: string; teamName?: string; isTeamMember: boolean }) => (
    <div data-testid="join-form" data-team={teamName} data-team-member={String(isTeamMember)}>
      {roomName}
    </div>
  ),
}));
vi.mock("@/components/retro/retro-board", () => ({
  RetroBoard: ({ retro, team, menu, banner }: { retro: { currentStageId: string }; team?: { name: string }; menu?: React.ReactNode; banner?: React.ReactNode }) => (
    <div data-testid="board" data-team={team?.name}>
      {retro.currentStageId}
      {menu}
      {banner}
    </div>
  ),
}));
vi.mock("@/components/retro/retro-menu", () => ({
  RetroMenu: ({ role }: { role: string }) => <div data-testid="menu">{role}</div>,
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
  mocks.auth.accountType = "anonymous";
  mocks.queries = { "retro.board": { currentStageId: "collect" }, "teams.listMine": [] };
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
    expect(screen.getByTestId("board").textContent).toContain("collect");
    expect(screen.getByTestId("menu").textContent).toBe("owner");
    expect(screen.queryByTestId("join-form")).toBeNull();
    expect(screen.queryByTestId("team-reader-banner")).toBeNull();
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
