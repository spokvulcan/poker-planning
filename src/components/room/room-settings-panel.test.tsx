/**
 * RoomSettingsPanel — the roster wiring between the permission decision layer
 * and the per-row promote/demote/transfer/remove controls. The decisions enter
 * through the real usePermissions hook (computePermissions over the roomData
 * prop) and the real rosterControls, so a denied actor sees every control
 * visible-but-disabled with the decision's denial copy as its accessible label
 * — and no onClick that would reach a mutation — while an allowed actor gets
 * live controls that reach the action seam. Convex IO, toast, presence, demo
 * mode, and the write seam (useRoomSettingsActions) are mocked; the decisions
 * are not.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  act,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { computePokerPermissions as computePermissions } from "@/hooks/usePermissions";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { UserWithPresence } from "@/hooks/useRoomPresence";
import type { Id } from "@/convex/_generated/dataModel";
import {
  denialMessage,
  type MemberRole,
  type RoomPermissions,
} from "@/convex/permissions";

// Hoisted recorders shared with the (hoisted) vi.mock factories below.
const mocks = vi.hoisted(() => ({
  roster: vi.fn((): UserWithPresence[] => []),
  removeUser: vi.fn(() => Promise.resolve(undefined)),
  promoteFacilitator: vi.fn(() => Promise.resolve(undefined)),
  demoteFacilitator: vi.fn(() => Promise.resolve(undefined)),
  transferOwnership: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => () => Promise.resolve(undefined),
  useAction: () => () => Promise.resolve(undefined),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

// Desktop branch of SidePanel — jsdom has no matchMedia.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("@/lib/toast", () => ({
  toast: { success: () => {}, error: () => {} },
}));

vi.mock("./demo/DemoSimulationProvider", () => ({
  useIsDemoMode: () => false,
  useDemoSimulation: () => null,
}));

// The roster comes from presence; the tests own it directly.
vi.mock("./room-presence", () => ({
  usePresenceRoster: () => mocks.roster(),
}));

// The write seam: record the four roster mutations, no-op the rest.
vi.mock("./hooks/useRoomSettingsActions", () => ({
  useRoomSettingsActions: () => ({
    rename: () => Promise.resolve(undefined),
    toggleAutoComplete: () => Promise.resolve(undefined),
    removeUser: mocks.removeUser,
    promoteFacilitator: mocks.promoteFacilitator,
    demoteFacilitator: mocks.demoteFacilitator,
    transferOwnership: mocks.transferOwnership,
    updatePermissions: () => Promise.resolve(undefined),
  }),
}));

import { RoomSettingsPanel } from "./room-settings-panel";

const allEveryone: RoomPermissions = {
  revealCards: "everyone",
  gameFlow: "everyone",
  issueManagement: "everyone",
  roomSettings: "everyone",
};

const ME = "u1" as Id<"users">;
const BOB = "u2" as Id<"users">;
const CAROL = "u3" as Id<"users">;

/** Minimal RoomWithRelatedData fixture — only the fields the mapping reads. */
function roomDataFor(actorRole: MemberRole): RoomWithRelatedData {
  return {
    room: {
      _id: "room-1",
      name: "Test Room",
      autoCompleteVoting: false,
      permissions: allEveryone,
    },
    users: [{ _id: ME, role: actorRole }],
    isOwnerAbsent: false,
  } as unknown as RoomWithRelatedData;
}

function rosterUser(
  id: Id<"users">,
  name: string,
  role: MemberRole
): UserWithPresence {
  return {
    _id: id,
    name,
    role,
    isSpectator: false,
    isOnline: true,
    lastSeen: null,
    joinedAt: 1,
    membershipId: `m-${id}`,
  } as unknown as UserWithPresence;
}

function renderPanel(actorRole: MemberRole) {
  return render(
    <RoomSettingsPanel
      roomData={roomDataFor(actorRole)}
      currentUserId={ME}
      isOpen={true}
      onClose={() => {}}
    />
  );
}

function rowFor(name: string): HTMLElement {
  const row = screen
    .getAllByTestId("participant-row")
    .find((el) => el.getAttribute("data-user-name") === name);
  if (!row) throw new Error(`no roster row rendered for ${name}`);
  return row;
}

// Exact denial copy from the decision layer. remove/promote are
// facilitator-level verbs; demote/transfer are owner-level verbs.
const FACILITATOR_LEVEL_DENIAL = denialMessage(
  { kind: "relationship", verb: "remove", targetRole: "participant" },
  "insufficient-role"
);
const OWNER_LEVEL_DENIAL = denialMessage(
  { kind: "relationship", verb: "transfer" },
  "insufficient-role"
);
const PROMOTE_TARGET_DENIAL = denialMessage(
  { kind: "relationship", verb: "promote", targetRole: "facilitator" },
  "target-rank"
);

afterEach(() => {
  cleanup();
  mocks.roster.mockReset();
  mocks.removeUser.mockClear();
  mocks.promoteFacilitator.mockClear();
  mocks.demoteFacilitator.mockClear();
  mocks.transferOwnership.mockClear();
});

describe("RoomSettingsPanel — roster denied for a participant actor", () => {
  it("all four controls render disabled with the decision's denial copy, and no click reaches a mutation", () => {
    // The fixture really does deny every relationship verb for this actor.
    const perms = computePermissions(roomDataFor("participant"), ME);
    expect(perms.removeTarget("participant").allowed).toBe(false);
    expect(perms.promoteTarget("participant").allowed).toBe(false);
    expect(perms.demoteTarget("participant").allowed).toBe(false);
    expect(perms.transfer.allowed).toBe(false);

    mocks.roster.mockReturnValue([
      rosterUser(ME, "Me", "participant"),
      rosterUser(BOB, "Bob", "participant"),
    ]);
    renderPanel("participant");

    // Render order in the row: promote, demote, transfer, remove.
    const buttons = within(rowFor("Bob")).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    const [promote, demote, transfer, remove] = buttons;

    for (const button of buttons) {
      expect(button).toHaveProperty("disabled", true);
    }
    expect(promote.getAttribute("aria-label")).toBe(FACILITATOR_LEVEL_DENIAL);
    expect(demote.getAttribute("aria-label")).toBe(OWNER_LEVEL_DENIAL);
    expect(transfer.getAttribute("aria-label")).toBe(OWNER_LEVEL_DENIAL);
    expect(remove.getAttribute("aria-label")).toBe(FACILITATOR_LEVEL_DENIAL);

    for (const button of buttons) {
      fireEvent.click(button);
    }
    expect(mocks.promoteFacilitator).not.toHaveBeenCalled();
    expect(mocks.demoteFacilitator).not.toHaveBeenCalled();
    expect(mocks.transferOwnership).not.toHaveBeenCalled();
    expect(mocks.removeUser).not.toHaveBeenCalled();
  });
});

describe("RoomSettingsPanel — roster allowed for the owner", () => {
  it("promote on a participant is enabled and reaches promoteFacilitator", () => {
    mocks.roster.mockReturnValue([
      rosterUser(ME, "Me", "owner"),
      rosterUser(BOB, "Bob", "participant"),
    ]);
    renderPanel("owner");

    const promote = within(rowFor("Bob")).getByRole("button", {
      name: "Promote Bob to facilitator",
    });
    expect(promote).toHaveProperty("disabled", false);

    fireEvent.click(promote);
    expect(mocks.promoteFacilitator).toHaveBeenCalledWith(BOB);
  });

  it("demote on a facilitator is enabled and reaches demoteFacilitator", () => {
    mocks.roster.mockReturnValue([
      rosterUser(ME, "Me", "owner"),
      rosterUser(CAROL, "Carol", "facilitator"),
    ]);
    renderPanel("owner");

    const demote = within(rowFor("Carol")).getByRole("button", {
      name: "Demote Carol to participant",
    });
    expect(demote).toHaveProperty("disabled", false);

    fireEvent.click(demote);
    expect(mocks.demoteFacilitator).toHaveBeenCalledWith(CAROL);
  });

  it("transfer on a participant is enabled and reaches transferOwnership after confirming", async () => {
    mocks.roster.mockReturnValue([
      rosterUser(ME, "Me", "owner"),
      rosterUser(BOB, "Bob", "participant"),
    ]);
    renderPanel("owner");

    const transfer = within(rowFor("Bob")).getByRole("button", {
      name: "Transfer ownership to Bob",
    });
    expect(transfer).toHaveProperty("disabled", false);

    fireEvent.click(transfer);
    expect(mocks.transferOwnership).not.toHaveBeenCalled();

    const confirm = await screen.findByRole("button", { name: "Transfer" });
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(mocks.transferOwnership).toHaveBeenCalledWith(BOB);
  });

  it("remove on a participant is enabled and reaches removeUser after confirming", async () => {
    mocks.roster.mockReturnValue([
      rosterUser(ME, "Me", "owner"),
      rosterUser(BOB, "Bob", "participant"),
    ]);
    renderPanel("owner");

    const remove = within(rowFor("Bob")).getByRole("button", {
      name: "Remove Bob",
    });
    expect(remove).toHaveProperty("disabled", false);

    fireEvent.click(remove);
    expect(mocks.removeUser).not.toHaveBeenCalled();

    const confirm = await screen.findByRole("button", { name: "Remove" });
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(mocks.removeUser).toHaveBeenCalledWith(BOB);
  });

  it("target-rank denials still surface per target: promote on a facilitator stays disabled", () => {
    mocks.roster.mockReturnValue([
      rosterUser(ME, "Me", "owner"),
      rosterUser(CAROL, "Carol", "facilitator"),
    ]);
    renderPanel("owner");

    const promote = within(rowFor("Carol")).getByRole("button", {
      name: PROMOTE_TARGET_DENIAL,
    });
    expect(promote).toHaveProperty("disabled", true);

    fireEvent.click(promote);
    expect(mocks.promoteFacilitator).not.toHaveBeenCalled();
  });
});
