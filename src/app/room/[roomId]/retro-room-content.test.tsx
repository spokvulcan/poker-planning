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
    retro: {
      board: "retro.board",
      mine: "retro.mine",
      advance: "retro.advance",
      nudge: "retro.nudge",
      nudgeStatus: "retro.nudgeStatus",
      setCardsVisible: "retro.setCardsVisible",
      setTimebox: "retro.setTimebox",
      createCard: "retro.createCard",
      updateCard: "retro.updateCard",
      moveCards: "retro.moveCards",
      deleteCard: "retro.deleteCard",
    },
    teams: { listMine: "teams.listMine" },
    presence: { setRetroPresence: "presence.setRetroPresence" },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: string, args: unknown) => (args === "skip" ? undefined : mocks.queries[ref]),
  useMutation: (ref: string) => {
    const fn = async (args: unknown) => {
      mocks.mutations.push({ fn: ref, args });
    };
    // The card mutations carry optimistic functions; the recorder ignores them.
    return Object.assign(fn, { withOptimisticUpdate: () => fn });
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
  RetroBoard: ({ retro, cards, team, menu, banner, viewer }: { retro: { currentStageId: string }; cards: { clientId: string; hidden: boolean }[]; team?: { name: string }; menu?: React.ReactNode; banner?: React.ReactNode; viewer?: { userId: string; onSetReady: (ready: boolean) => void; onEditing: (clientId?: string) => void; controls: { onAdvance: (id: string) => void; stageFlow: { allowed: boolean }; nudge?: { status: unknown; attribution: string; onNudge: () => void } }; cards: { move: (moves: unknown[]) => void } } }) => (
    <div data-testid="board" data-team={team?.name} data-viewer={viewer?.userId} data-stage-flow={String(viewer?.controls.stageFlow.allowed)} data-cards={cards.map((c) => `${c.clientId}:${c.hidden}`).join(",")} data-nudge={JSON.stringify(viewer?.controls.nudge?.status ?? null)} data-nudge-attribution={viewer?.controls.nudge?.attribution}>
      {retro.currentStageId}
      {menu}
      {banner}
      {viewer && <button onClick={() => viewer.onSetReady(true)}>ready</button>}
      {viewer && <button onClick={() => viewer.onEditing("c1")}>edit</button>}
      {viewer && <button onClick={() => viewer.controls.onAdvance("s2")}>advance</button>}
      {viewer?.controls.nudge && <button onClick={() => viewer.controls.nudge!.onNudge()}>nudge</button>}
      {viewer && <button onClick={() => viewer.cards.move([{ clientId: "c1", position: { x: 1, y: 1 } }])}>move</button>}
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
    "retro.board": {
      retro: { currentStageId: "s1", attribution: "named", stages: [{ id: "s1", kind: "collect" }, { id: "s2", kind: "group" }] },
      clusters: [],
      cards: [
        { _id: "id1", clientId: "c1", position: { x: 0, y: 0 }, promptId: "p1" },
        { _id: "id2", clientId: "c2", position: { x: 0, y: 0 }, promptId: "p1" },
      ],
      writers: ["user1"],
    },
    "retro.mine": [
      { _id: "id1", clientId: "c1", position: { x: 0, y: 0 }, promptId: "p1", text: "mine", authorId: "user1", createdAt: 1, updatedAt: 1, committedAt: 1 },
    ],
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

  it("an attendee heartbeats as themselves, writes the presence payload keyed to the shared entry, and holds the stageFlow decision", async () => {
    render(<RetroRoomContent roomId={roomId} roomData={teamless} membership={{ _id: "user1" as never }} />);
    expect(mocks.presenceCalls[0]?.slice(1)).toEqual([roomId, "user1"]);
    const board = screen.getByTestId("board");
    expect(board.getAttribute("data-viewer")).toBe("user1");
    expect(board.getAttribute("data-stage-flow")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "ready" }));
    await new Promise((r) => setTimeout(r, 0));
    // The editing write carries the readiness just toggled (one whole payload).
    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    fireEvent.click(screen.getByRole("button", { name: "advance" }));
    fireEvent.click(screen.getByRole("button", { name: "move" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.mutations).toEqual([
      { fn: "presence.setRetroPresence", args: { roomId, userId: "user1", stageId: "s1", ready: true } },
      { fn: "presence.setRetroPresence", args: { roomId, userId: "user1", stageId: "s1", ready: true, editing: "c1" } },
      { fn: "retro.advance", args: { roomId, toStageId: "s2" } },
      { fn: "retro.moveCards", args: { roomId, moves: [{ clientId: "c1", position: { x: 1, y: 1 } }] } },
    ]);
  });

  it("an attendee of a team retro reads the nudge status and presses the nudge; a teamless retro reads none", async () => {
    mocks.auth.accountType = "permanent";
    mocks.queries["teams.listMine"] = [{ _id: "team-1", name: "Acme Squad" }];
    mocks.queries["retro.nudgeStatus"] = { recipientCount: 2, lastNudge: null };
    const asOwner = { ...(teamed as object), users: [{ _id: "user1", role: "owner" }] } as never;
    render(<RetroRoomContent roomId={roomId} roomData={asOwner} membership={{ _id: "user1" as never }} />);
    const board = screen.getByTestId("board");
    expect(JSON.parse(board.getAttribute("data-nudge")!)).toEqual({ recipientCount: 2, lastNudge: null });
    expect(board.getAttribute("data-nudge-attribution")).toBe("named");
    fireEvent.click(screen.getByRole("button", { name: "nudge" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.mutations).toContainEqual({ fn: "retro.nudge", args: { roomId } });
    cleanup();

    render(<RetroRoomContent roomId={roomId} roomData={teamless} membership={{ _id: "user1" as never }} />);
    expect(screen.getByTestId("board").getAttribute("data-nudge")).toBe("null");
  });

  it("a participant without stageFlow is handed no nudge control and never opens its read", () => {
    mocks.auth.accountType = "permanent";
    mocks.queries["teams.listMine"] = [{ _id: "team-1", name: "Acme Squad" }];
    mocks.queries["retro.nudgeStatus"] = { recipientCount: 2, lastNudge: null };
    const asParticipant = { ...(teamed as object), users: [{ _id: "user1", role: "participant" }] } as never;
    render(<RetroRoomContent roomId={roomId} roomData={asParticipant} membership={{ _id: "user1" as never }} />);
    const board = screen.getByTestId("board");
    expect(board.getAttribute("data-stage-flow")).toBe("false");
    expect(board.getAttribute("data-nudge")).toBe("null");
    expect(screen.queryByRole("button", { name: "nudge" })).toBeNull();
  });

  it("merges the board with mine: own silhouettes carry text, others stay hidden; a Team reader gets no mine", () => {
    render(<RetroRoomContent roomId={roomId} roomData={teamless} membership={{ _id: "user1" as never }} />);
    expect(screen.getByTestId("board").getAttribute("data-cards")).toBe("c1:false,c2:true");
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
    // No attendance, no `mine`: every card is a silhouette to a Team reader.
    expect(board.getAttribute("data-cards")).toBe("c1:true,c2:true");
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
