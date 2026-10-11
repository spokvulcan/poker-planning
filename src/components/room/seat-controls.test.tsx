/**
 * The viewer's seat, which the room hands the account menu (useSeatControls):
 * sitting out and coming back where the ceremony has spectators, and leaving
 * the room, confirmed outside the menu. The room builds it from its own
 * roster, so the account menu reads no room; a refusal shows the server's
 * own words.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { RoomUserData } from "@/convex/model/memberships";

const mocks = vi.hoisted(() => ({
  writes: [] as [string, unknown][],
  refusal: null as string | null,
  toasts: [] as string[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const { refusal } = await import("@/convex/model/refusal");
  return {
    useMutation: (fn: Parameters<typeof getFunctionName>[0]) => async (args: unknown) => {
      mocks.writes.push([getFunctionName(fn), args]);
      if (mocks.refusal) throw refusal("forbidden", mocks.refusal);
    },
  };
});

vi.mock("@/lib/toast", () => ({ toast: { error: (message: string) => mocks.toasts.push(message) } }));

// The menu's items and the dialog, drawn in place; the dialog only while open.
vi.mock("@/components/ui/dropdown-menu", async () => {
  const { cloneElement } = await import("react");
  const Item = ({ children, render, ...props }: { children?: ReactNode; render?: ReactElement }) =>
    render ? cloneElement(render, props, children) : <button {...props}>{children}</button>;
  return { DropdownMenuItem: Item };
});
vi.mock("@/components/ui/alert-dialog", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    AlertDialog: ({ open, children }: { open: boolean; children?: ReactNode }) => (open ? <div role="alertdialog">{children}</div> : null),
    AlertDialogContent: Pass,
    AlertDialogHeader: Pass,
    AlertDialogFooter: Pass,
    AlertDialogTitle: Pass,
    AlertDialogDescription: Pass,
    AlertDialogCancel: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
    AlertDialogAction: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
      <button onClick={onClick}>{children}</button>
    ),
  };
});

import { useSeatControls } from "./seat-controls";

const ROOM = "room-1" as Id<"rooms">;
const poker = { _id: ROOM, roomType: "canvas" } as Doc<"rooms">;
const retro = { _id: ROOM, roomType: "retro" } as Doc<"rooms">;
const seated = (extra: Partial<RoomUserData> = {}): RoomUserData => ({
  _id: "user-ann" as Id<"users">,
  name: "Ann",
  isSpectator: false,
  role: "participant",
  joinedAt: 0,
  membershipId: "m-ann" as Id<"roomMemberships">,
  ...extra,
});

function Seat({ room, me }: { room: Doc<"rooms">; me: RoomUserData | undefined }) {
  const seat = useSeatControls({ room, me });
  return (
    <>
      <div data-testid="items">{seat?.items}</div>
      {seat?.dialog}
    </>
  );
}

const click = (element: HTMLElement) => act(async () => void fireEvent.click(element));

beforeEach(() => {
  mocks.writes = [];
  mocks.refusal = null;
  mocks.toasts = [];
});

afterEach(cleanup);

describe("useSeatControls", () => {
  it("lets a poker player sit out as a spectator", async () => {
    render(<Seat room={poker} me={seated()} />);

    await click(screen.getByTestId("spectator-toggle-row"));

    expect(mocks.writes).toEqual([["users:edit", { roomId: ROOM, isSpectator: true }]]);
  });

  it("offers a retro no spectator seat, and leaving under its own name", () => {
    render(<Seat room={retro} me={seated()} />);

    expect(screen.queryByTestId("spectator-toggle-row")).toBeNull();
    expect(screen.getByRole("button", { name: /Leave retro/ })).toBeTruthy();
  });

  it("leaves the room once the person confirms", async () => {
    render(<Seat room={poker} me={seated()} />);

    await click(screen.getByRole("button", { name: /Leave room/ }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Leave this room?");
    expect(mocks.writes).toEqual([]);

    await click(screen.getByRole("button", { name: "Leave" }));
    expect(mocks.writes).toEqual([["users:leave", { roomId: ROOM }]]);
  });

  it("warns an owner that what only they can do stays locked until they come back", async () => {
    render(<Seat room={poker} me={seated({ role: "owner" })} />);

    await click(screen.getByRole("button", { name: /Leave room/ }));

    expect(screen.getByRole("alertdialog").textContent).toContain("stays locked until you come back");
  });

  it("shows a refusal in the server's own words", async () => {
    mocks.refusal = "Only the owner can do this.";
    render(<Seat room={poker} me={seated()} />);

    await click(screen.getByTestId("spectator-toggle-row"));

    expect(mocks.toasts).toEqual(["Only the owner can do this."]);
  });

  it("offers nothing to someone not seated in the room", () => {
    render(<Seat room={poker} me={undefined} />);

    expect(screen.getByTestId("items").textContent).toBe("");
  });
});
