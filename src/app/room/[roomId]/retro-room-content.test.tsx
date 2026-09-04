/**
 * The room page's retro branch (spec §18.1): never auto-joins (it holds no
 * join mutation at all), shows the retro join form to a visitor without a
 * membership, and mounts the board once a membership exists.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  join: vi.fn(),
  auth: { authUserId: "auth-1", isLoading: false, isAuthenticated: true, accountType: "anonymous" },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { retro: { board: "retro.board" } },
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: string, args: unknown) => (args === "skip" ? undefined : mocks.queries[ref]),
  useMutation: () => mocks.join,
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/components/retro/retro-join-form", () => ({
  RetroJoinForm: ({ roomName }: { roomName: string }) => <div data-testid="join-form">{roomName}</div>,
}));
vi.mock("@/components/retro/retro-board", () => ({
  RetroBoard: ({ retro }: { retro: { currentStageId: string } }) => (
    <div data-testid="board">{retro.currentStageId}</div>
  ),
}));

import { RetroRoomContent } from "./retro-room-content";
import type { Id } from "@/convex/_generated/dataModel";

const roomId = "room1" as Id<"rooms">;
const roomData = {
  room: { _id: roomId, name: "Sprint 12", roomType: "retro", joinPolicy: "anyone" },
  users: [],
  votes: [],
  isOwnerAbsent: false,
} as never;

beforeEach(() => {
  mocks.join.mockReset();
  mocks.queries = { "retro.board": { currentStageId: "collect" } };
});
afterEach(cleanup);

describe("RetroRoomContent", () => {
  it("shows the join form to a visitor without a membership, and never auto-joins", async () => {
    render(<RetroRoomContent roomId={roomId} roomData={roomData} membership={null} />);
    expect(screen.getByTestId("join-form").textContent).toBe("Sprint 12");
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.join).not.toHaveBeenCalled();
    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("mounts the board once a membership exists", () => {
    render(
      <RetroRoomContent roomId={roomId} roomData={roomData} membership={{ _id: "user1" as never }} />
    );
    expect(screen.getByTestId("board").textContent).toBe("collect");
    expect(screen.queryByTestId("join-form")).toBeNull();
  });
});
