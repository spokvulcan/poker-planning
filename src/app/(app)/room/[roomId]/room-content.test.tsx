/**
 * The room page's join gate, from the viewer AuthProvider hands out: a
 * signed-in viewer whose users row has a name is joined under it without
 * being asked; one signed in with no row yet (as after "Continue as guest")
 * is ready all the same and gets the join dialog, like a visitor. The room
 * shell and the caller's membership are reads the test answers; the boards
 * and the join dialog are stand-ins.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Viewer } from "@/components/auth/auth-provider";

const mocks = vi.hoisted(() => ({
  viewer: { status: "loading" } as Viewer,
  // The caller's membership in the room: undefined until it answers, null when they have none
  membership: undefined as { _id: string } | null | undefined,
  joins: [] as unknown[],
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    isLoading: mocks.viewer.status === "loading",
    isAuthenticated: mocks.viewer.status === "signedIn",
    viewer: mocks.viewer,
  }),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => {
      if (args === "skip") return undefined;
      switch (getFunctionName(query)) {
        case "rooms:get":
          return { room: { _id: "room-1", name: "Sprint 12", roomType: "canvas" }, users: [], votes: [], isOwnerAbsent: false };
        case "users:getMyMembership":
          return mocks.membership;
        default:
          return undefined;
      }
    },
    useMutation: () => async (args: unknown) => {
      mocks.joins.push(args);
    },
  };
});

vi.mock("next/navigation", () => ({ useParams: () => ({ roomId: "room-1" }) }));

vi.mock("@/components/room/room-canvas", () => ({ RoomCanvas: () => <p>The poker board</p> }));
vi.mock("@/components/retro/retro-canvas", () => ({ RetroCanvas: () => <p>The retro board</p> }));
vi.mock("@/components/room/join-room-dialog", () => ({ JoinRoomDialog: () => <p>The join dialog</p> }));
vi.mock("@/lib/toast", () => ({ toast: { error: () => {} } }));

import { RoomContent } from "./room-content";

/** Renders the room page and lets its effects (the auto-join) run. */
async function renderRoom() {
  render(<RoomContent />);
  await act(async () => {});
}

beforeEach(() => {
  mocks.viewer = { status: "loading" };
  mocks.membership = undefined;
  mocks.joins = [];
});

afterEach(cleanup);

describe("RoomContent's join gate", () => {
  it("joins a signed-in viewer whose users row has a name under it", async () => {
    mocks.viewer = { status: "signedIn", name: "Ann", avatarUrl: null, email: null, isPermanent: false };
    mocks.membership = null;
    await renderRoom();

    expect(mocks.joins).toEqual([{ roomId: "room-1", name: "Ann" }]);
  });

  it("gives a viewer signed in with no users row yet the join dialog, and joins no one", async () => {
    mocks.viewer = { status: "signedIn", name: null, avatarUrl: null, email: null, isPermanent: false };
    mocks.membership = null;
    await renderRoom();

    expect(screen.getByText("The join dialog")).toBeTruthy();
    expect(mocks.joins).toEqual([]);
  });

  it("gives a visitor the join dialog", async () => {
    mocks.viewer = { status: "visitor" };
    await renderRoom();

    expect(screen.getByText("The join dialog")).toBeTruthy();
    expect(mocks.joins).toEqual([]);
  });

  it("waits while the viewer loads, and joins no one", async () => {
    await renderRoom();

    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(screen.queryByText("The join dialog")).toBeNull();
    expect(mocks.joins).toEqual([]);
  });

  it("shows a member the board", async () => {
    mocks.viewer = { status: "signedIn", name: "Ann", avatarUrl: null, email: null, isPermanent: false };
    mocks.membership = { _id: "user-ann" };
    await renderRoom();

    expect(screen.getByText("The poker board")).toBeTruthy();
    expect(mocks.joins).toEqual([]);
  });
});
