/**
 * RoomCanvas: the poker board's adapter, tested where it meets the
 * whiteboard, through the whiteboard's own test stand-ins: React Flow draws
 * the board's nodes and reports the gestures (a drop, Delete), and Convex is
 * its local cache, where a write's optimistic update lands at once. The tests
 * make the gestures, click the controls the nodes and the chrome draw, and
 * read what the board then shows and the writes that reach the server. The
 * board gets the room's data from `rooms.get`, as the room page hands it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@xyflow/react", async (importOriginal) =>
  (await import("@/components/whiteboard/testing/react-flow")).mockReactFlow(await importOriginal<object>())
);
vi.mock("convex/react", async (importOriginal) =>
  (await import("@/components/whiteboard/testing/convex")).mockConvexReact(await importOriginal<object>())
);
vi.mock("@convex-dev/presence/react", () => ({ default: () => undefined }));
// The account menu the board puts in its chrome: the viewer's, not the board's.
vi.mock("@/components/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/components/canvas-dots-background", () => ({ CanvasDotsBackground: () => null }));

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasNode } from "@/convex/model/canvas";
import type { RoomUserData } from "@/convex/model/memberships";
import { refusal } from "@/convex/model/refusal";
import type { RoomWithRelatedData, SanitizedVote } from "@/convex/model/rooms";
import { convex, refuse, resetConvex, serve } from "@/components/whiteboard/testing/convex";
import { drop, flow, nodeOf, pressDelete, resetFlow, select } from "@/components/whiteboard/testing/react-flow";
import { RoomCanvas } from "./room-canvas";
import type { VotingCardNodeData } from "./types";

const ROOM_ID = "room-1" as Id<"rooms">;
const ISSUE_ID = "issue-1" as Id<"issues">;
const ME = "user-me" as Id<"users">;
const ADA = "user-ada" as Id<"users">;
const BOB = "user-bob" as Id<"users">;
const OLGA = "user-olga" as Id<"users">;

function member(id: Id<"users">, name: string, role: RoomUserData["role"] = "participant"): RoomUserData {
  return { _id: id, name, isSpectator: false, role, joinedAt: 0, membershipId: `m-${id}` as Id<"roomMemberships"> };
}

function canvasNode(nodeId: string, type: CanvasNode["type"], data: object, x = 0): CanvasNode {
  return { roomId: ROOM_ID, nodeId, type, data, position: { x, y: 0 }, lastUpdatedAt: 0 } as CanvasNode;
}

// What the server holds for the board's own queries, served as the board renders.
let canvasNodes: CanvasNode[] = [];
let currentIssue: { _id: Id<"issues">; title: string } | null = null;

/** The round is on an issue, and the issue's note says `content`. */
function withNote(content: string) {
  currentIssue = { _id: ISSUE_ID, title: "Checkout flow" };
  canvasNodes = [...canvasNodes, canvasNode("note-1", "note", { issueId: ISSUE_ID, issueTitle: "Checkout flow", content }, 400)];
}

/** A vote as the viewer is sent it: their own with its card, anyone else's face down until the reveal. */
function vote(userId: Id<"users">, cardLabel?: string): SanitizedVote {
  return { _id: `vote-${userId}` as Id<"votes">, _creationTime: 0, roomId: ROOM_ID, userId, cardLabel, hasVoted: true };
}

const dialog = () => within(screen.getByRole("alertdialog"));

function roomData(overrides: Partial<RoomWithRelatedData> = {}): RoomWithRelatedData {
  return {
    room: {
      _id: ROOM_ID,
      _creationTime: 0,
      name: "Sprint 42",
      roomType: "canvas",
      autoCompleteVoting: false,
      isGameOver: false,
      createdAt: 0,
      lastActivityAt: 0,
      retained: false,
    },
    users: [member(ME, "Me", "facilitator"), member(ADA, "Ada")],
    votes: [] as SanitizedVote[],
    isOwnerAbsent: false,
    ...overrides,
  };
}

/** The board as the room page shows it, with the room's data from `rooms.get`. */
function Room() {
  const data = useQuery(api.rooms.get, { roomId: ROOM_ID });
  return data ? <RoomCanvas roomData={data} currentUserId={ME} /> : null;
}

/** Shows the board; `rerender` is the server sending the room's data again. */
function renderBoard(data = roomData()) {
  serve(api.rooms.get, { roomId: ROOM_ID }, data);
  serve(api.canvas.getCanvasNodes, { roomId: ROOM_ID }, canvasNodes);
  serve(api.issues.getCurrent, { roomId: ROOM_ID }, currentIssue as never);
  const view = render(<Room />);
  return {
    rerender: (next: RoomWithRelatedData) => {
      act(() => serve(api.rooms.get, { roomId: ROOM_ID }, next));
      view.rerender(<Room />);
    },
  };
}

/** The cards the viewer sees raised. */
const raisedCards = () =>
  screen.queryAllByRole("button", { name: /^Vote /, pressed: true }).map((card) => card.textContent);

/** The node of the card that plays `label`. */
const cardNode = (label: string) => {
  const found = flow.nodes.find((n) => n.type === "votingCard" && (n.data as VotingCardNodeData).card.value === label);
  if (!found) throw new Error(`no card ${label} on the board`);
  return found;
};

beforeEach(() => {
  resetFlow();
  resetConvex();
  canvasNodes = [
    canvasNode("session-current", "session", {}),
    canvasNode(`player-${ME}`, "player", { userId: ME }),
    canvasNode(`player-${ADA}`, "player", { userId: ADA }, 200),
  ];
  currentIssue = null;
});

afterEach(cleanup);

describe("a drop", () => {
  it("saves where every node it moved went, in one write", () => {
    renderBoard();

    drop({ x: 10, y: 20 }, "session-current", `player-${ADA}`);

    expect(convex.writes).toEqual([
      {
        name: "canvas:moveNodes",
        args: {
          roomId: ROOM_ID,
          moves: [
            { nodeId: "session-current", position: { x: 10, y: 20 } },
            { nodeId: `player-${ADA}`, position: { x: 210, y: 20 } },
          ],
        },
      },
    ]);
  });

  it("shows the nodes where they were dropped the moment it is made, and keeps them there once the server has it", async () => {
    renderBoard();

    await act(async () => drop({ x: 10, y: 20 }, "session-current"));
    expect(nodeOf("session-current").position).toEqual({ x: 10, y: 20 });

    act(() =>
      serve(api.canvas.getCanvasNodes, { roomId: ROOM_ID }, [
        { ...canvasNodes[0], position: { x: 10, y: 20 } },
        ...canvasNodes.slice(1),
      ])
    );
    expect(nodeOf("session-current").position).toEqual({ x: 10, y: 20 });
  });

  it("puts the nodes back where they were when the server refuses the move", async () => {
    refuse(refusal("forbidden", "Not a member of this room"), api.canvas.moveNodes);
    renderBoard();

    await act(async () => drop({ x: 10, y: 20 }, "session-current"));

    expect(convex.refused.map((write) => write.name)).toEqual(["canvas:moveNodes"]);
    expect(nodeOf("session-current").position).toEqual({ x: 0, y: 0 });
  });
});

describe("Delete on a note", () => {
  it("takes an empty note off at once", () => {
    withNote("");
    renderBoard();

    pressDelete("note-1");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(convex.writes).toEqual([
      { name: "canvas:deleteNote", args: { roomId: ROOM_ID, nodeId: "note-1" } },
    ]);
  });

  it("asks first when the note has words in it, and Cancel keeps it", () => {
    withNote("Risks: auth");
    renderBoard();

    pressDelete("note-1");
    expect(dialog().getByText("Delete note?")).toBeDefined();
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }));

    expect(convex.writes).toEqual([]);
  });

  it("takes the note off once the viewer confirms", () => {
    withNote("Risks: auth");
    renderBoard();

    pressDelete("note-1");
    fireEvent.click(dialog().getByRole("button", { name: "Delete" }));

    expect(convex.writes).toEqual([
      { name: "canvas:deleteNote", args: { roomId: ROOM_ID, nodeId: "note-1" } },
    ]);
  });
});

describe("Delete on players", () => {
  // The viewer is a facilitator: they may remove participants, not the owner.
  const everyone = () =>
    roomData({
      users: [member(ME, "Me", "facilitator"), member(OLGA, "Olga", "owner"), member(ADA, "Ada"), member(BOB, "Bob")],
    });
  beforeEach(() => {
    canvasNodes = [OLGA, ADA, BOB, ME].map((id, i) => canvasNode(`player-${id}`, "player", { userId: id }, i * 200));
  });

  it("asks once about everyone the viewer may remove, never themselves, and removes them on confirm", () => {
    renderBoard(everyone());

    pressDelete(`player-${ME}`, `player-${OLGA}`, `player-${ADA}`, `player-${BOB}`);
    expect(dialog().getByText("Remove 2 players?")).toBeDefined();
    expect(dialog().getByText(/This will remove Ada and Bob from the room/)).toBeDefined();
    fireEvent.click(dialog().getByRole("button", { name: "Remove" }));

    expect(convex.writes).toEqual([
      { name: "users:remove", args: { userId: ADA, roomId: ROOM_ID } },
      { name: "users:remove", args: { userId: BOB, roomId: ROOM_ID } },
    ]);
  });

  it("removes no one when the viewer cancels", () => {
    renderBoard(everyone());

    pressDelete(`player-${ADA}`);
    expect(dialog().getByText("Remove Ada?")).toBeDefined();
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }));

    expect(convex.writes).toEqual([]);
  });

  it("asks nothing of a viewer who may remove no one", () => {
    const asParticipant = everyone();
    asParticipant.users[0] = member(ME, "Me");
    renderBoard(asParticipant);

    pressDelete(`player-${ADA}`, `player-${BOB}`);

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(convex.writes).toEqual([]);
  });
});

describe("the nodes' controls", () => {
  it("reveal the cards from the session node", () => {
    renderBoard(roomData({ votes: [vote(ADA)] }));

    fireEvent.click(screen.getByRole("button", { name: "Reveal all votes" }));

    expect(convex.writes).toEqual([{ name: "rooms:showCards", args: { roomId: ROOM_ID } }]);
  });

  it("cast the viewer's vote from a card", async () => {
    renderBoard();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Vote 5" })));

    expect(convex.writes).toEqual([
      { name: "votes:pickCard", args: { roomId: ROOM_ID, cardLabel: "5" } },
    ]);
  });

  it("ask before the note's ✕ takes off a note with words in it, as Delete does", () => {
    withNote("Risks: auth");
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));

    expect(dialog().getByText("Delete note?")).toBeDefined();
    expect(convex.writes).toEqual([]);
  });
});

describe("the chrome around the board", () => {
  it("opens the issues beside the board from the session node's button", () => {
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Quick Vote mode. Click to open issues panel." }));

    expect(screen.getByRole("heading", { name: "Issues" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Issues" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("the raised card", () => {
  it("rises the moment the viewer picks it, before the server answers", async () => {
    renderBoard();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Vote 5" })));

    expect(raisedCards()).toEqual(["5"]);
  });

  it("comes down again when the server refuses the vote", async () => {
    refuse(refusal("forbidden", "Spectators don't vote"), api.votes.pickCard);
    renderBoard();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Vote 5" })));

    expect(raisedCards()).toEqual([]);
  });

  it("comes down when a reset clears the viewer's vote, the card they clicked included", async () => {
    const { rerender } = renderBoard();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Vote 5" })));
    select(cardNode("5").id);
    rerender(roomData({ votes: [vote(ME, "5")] }));
    expect(raisedCards()).toEqual(["5"]);

    rerender(roomData());

    expect(raisedCards()).toEqual([]);
  });
});

describe("what React Flow is handed", () => {
  it("keeps a note's object through a server update that doesn't touch the note", () => {
    withNote("Risks: auth");
    const { rerender } = renderBoard();
    const before = nodeOf("note-1");

    rerender(roomData({ votes: [vote(ADA)] }));

    expect(nodeOf("session-current").data).toMatchObject({ voteCount: 1 });
    expect(nodeOf("note-1")).toBe(before);
  });

  it("keeps every node's object through a server update that changes nothing on the board", () => {
    withNote("Risks: auth");
    const { rerender } = renderBoard();
    const before = flow.nodes;

    rerender(roomData());

    expect(flow.nodes.filter((n, i) => n !== before[i]).map((n) => n.id)).toEqual([]);
  });

  it("is the same nodes and edges when the board renders again with nothing new", () => {
    const data = roomData();
    const { rerender } = renderBoard(data);
    const { nodes, edges } = flow.props;

    rerender(data);

    expect(flow.props.nodes).toBe(nodes);
    expect(flow.props.edges).toBe(edges);
  });

  it("keeps the edges when only the nodes change, as when the viewer picks a card", async () => {
    renderBoard();
    const { nodes, edges } = flow.props;

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Vote 5" })));

    expect(flow.props.nodes).not.toBe(nodes);
    expect(flow.props.edges).toBe(edges);
  });
});
