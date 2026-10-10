/**
 * RoomCanvas: the poker board's adapter, tested where it meets the
 * whiteboard. React Flow is stubbed as in the whiteboard's own test: the
 * tests drive the callbacks it would call (a drop, Delete) and click the
 * controls the board's nodes draw, and read the writes that reach Convex.
 * The board gets the room's data from `rooms.get`, as the room page hands it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Node, ReactFlowProps } from "@xyflow/react";
import type { ReactNode } from "react";

const flow = vi.hoisted(() => ({
  props: {} as ReactFlowProps<Node>,
  nodes: [] as Node[],
}));

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  const { createElement, Fragment } = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    // Draws each node with its node type and data, as React Flow would.
    ReactFlow: (props: ReactFlowProps<Node>) => {
      flow.props = props;
      flow.nodes = (props.nodes ?? []) as Node[];
      return createElement(
        Fragment,
        null,
        ...flow.nodes.map((n) => {
          const type = props.nodeTypes?.[n.type ?? ""];
          return type
            ? createElement(type, { key: n.id, id: n.id, data: n.data, selected: !!n.selected } as never)
            : null;
        })
      );
    },
    ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
    Handle: () => null,
    useNodesInitialized: () => true,
    useReactFlow: () => ({
      getNode: (id: string) => flow.nodes.find((n) => n.id === id),
      getIntersectingNodes: () => [],
      fitView: () => Promise.resolve(true),
      setCenter: () => Promise.resolve(true),
      getZoom: () => 1,
    }),
  };
});

// The server: what the board's queries return, and every write it makes. The
// room's data is live, as Convex keeps it: a write's optimistic update lands
// on it at once, and the server answers no write.
const server = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    room: undefined as unknown,
    canvasNodes: [] as unknown[],
    currentIssue: null as unknown,
    writes: [] as { name: string; args: Record<string, unknown> }[],
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setRoom: (room: unknown) => {
      state.room = room;
      for (const listener of listeners) listener();
    },
  };
  return state;
});

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const { useSyncExternalStore } = await vi.importActual<typeof import("react")>("react");
  type Ref = Parameters<typeof getFunctionName>[0];
  // What an optimistic update reads and writes: the room's data.
  const store = {
    getQuery: (query: Ref) => (getFunctionName(query) === "rooms:get" ? server.room : undefined),
    setQuery: (query: Ref, _args: unknown, value: unknown) => {
      if (getFunctionName(query) === "rooms:get") server.setRoom(value);
    },
  };
  return {
    useQuery: (query: Ref, args: unknown) => {
      const room = useSyncExternalStore(server.subscribe, () => server.room);
      if (args === "skip") return undefined;
      const name = getFunctionName(query);
      if (name === "rooms:get") return room;
      if (name === "canvas:getCanvasNodes") return server.canvasNodes;
      if (name === "issues:getCurrent") return server.currentIssue;
      return undefined;
    },
    useMutation: (mutation: Ref) => {
      const name = getFunctionName(mutation);
      const write = (args: Record<string, unknown>) => {
        server.writes.push({ name, args });
        return Promise.resolve(undefined);
      };
      return Object.assign(write, {
        withOptimisticUpdate:
          (update: (local: typeof store, args: Record<string, unknown>) => void) =>
          (args: Record<string, unknown>) => {
            update(store, args);
            return write(args);
          },
      });
    },
  };
});

vi.mock("@convex-dev/presence/react", () => ({ default: () => undefined }));
// The room's chrome: not what this board means by its gestures.
vi.mock("./canvas-navigation", () => ({ CanvasNavigation: () => null }));
vi.mock("@/components/canvas-dots-background", () => ({ CanvasDotsBackground: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasNode } from "@/convex/model/canvas";
import type { RoomUserData } from "@/convex/model/memberships";
import type { RoomWithRelatedData, SanitizedVote } from "@/convex/model/rooms";
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

/** The round is on an issue, and the issue's note says `content`. */
function withNote(content: string) {
  server.currentIssue = { _id: ISSUE_ID, title: "Checkout flow" };
  server.canvasNodes = [
    ...server.canvasNodes,
    canvasNode("note-1", "note", { issueId: ISSUE_ID, issueTitle: "Checkout flow", content }, 400),
  ];
}

/** A vote as the viewer is sent it: their own with its card, anyone else's face down until the reveal. */
function vote(userId: Id<"users">, cardLabel?: string): SanitizedVote {
  return { _id: `vote-${userId}` as Id<"votes">, _creationTime: 0, roomId: ROOM_ID, userId, cardLabel, hasVoted: true };
}

/** Delete or Backspace on these nodes, as React Flow reports it. */
function pressDelete(...ids: string[]) {
  act(() => flow.props.onNodesChange?.(ids.map((id) => ({ type: "remove" as const, id }))));
}

/** React Flow selecting a node the viewer clicked, as it reports it. */
function selectNode(id: string) {
  act(() => flow.props.onNodesChange?.([{ type: "select" as const, id, selected: true }]));
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
  server.room = data;
  const view = render(<Room />);
  return {
    rerender: (next: RoomWithRelatedData) => {
      server.room = next;
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

const event = {} as never;
const node = (id: string) => {
  const found = flow.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id} on the board`);
  return found;
};

beforeEach(() => {
  server.canvasNodes = [
    canvasNode("session-current", "session", {}),
    canvasNode(`player-${ME}`, "player", { userId: ME }),
    canvasNode(`player-${ADA}`, "player", { userId: ADA }, 200),
  ];
  server.currentIssue = null;
  server.writes = [];
});

afterEach(cleanup);

describe("a drop", () => {
  it("saves where every node it moved went, in one write", () => {
    renderBoard();
    const moved = [
      { ...node("session-current"), position: { x: 10, y: 20 } },
      { ...node(`player-${ADA}`), position: { x: 300, y: 40 } },
    ];

    act(() => {
      flow.props.onNodeDragStart?.(event, moved[0], moved);
      flow.props.onNodeDragStop?.(event, moved[0], moved);
    });

    expect(server.writes).toEqual([
      {
        name: "canvas:moveNodes",
        args: {
          roomId: ROOM_ID,
          moves: [
            { nodeId: "session-current", position: { x: 10, y: 20 } },
            { nodeId: `player-${ADA}`, position: { x: 300, y: 40 } },
          ],
        },
      },
    ]);
  });
});

describe("Delete on a note", () => {
  it("takes an empty note off at once", () => {
    withNote("");
    renderBoard();

    pressDelete("note-1");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(server.writes).toEqual([
      { name: "canvas:deleteNote", args: { roomId: ROOM_ID, nodeId: "note-1" } },
    ]);
  });

  it("asks first when the note has words in it, and Cancel keeps it", () => {
    withNote("Risks: auth");
    renderBoard();

    pressDelete("note-1");
    expect(dialog().getByText("Delete note?")).toBeDefined();
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }));

    expect(server.writes).toEqual([]);
  });

  it("takes the note off once the viewer confirms", () => {
    withNote("Risks: auth");
    renderBoard();

    pressDelete("note-1");
    fireEvent.click(dialog().getByRole("button", { name: "Delete" }));

    expect(server.writes).toEqual([
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
    server.canvasNodes = [OLGA, ADA, BOB, ME].map((id, i) => canvasNode(`player-${id}`, "player", { userId: id }, i * 200));
  });

  it("asks once about everyone the viewer may remove, never themselves, and removes them on confirm", () => {
    renderBoard(everyone());

    pressDelete(`player-${ME}`, `player-${OLGA}`, `player-${ADA}`, `player-${BOB}`);
    expect(dialog().getByText("Remove 2 players?")).toBeDefined();
    expect(dialog().getByText(/This will remove Ada and Bob from the room/)).toBeDefined();
    fireEvent.click(dialog().getByRole("button", { name: "Remove" }));

    expect(server.writes).toEqual([
      { name: "users:remove", args: { userId: ADA, roomId: ROOM_ID } },
      { name: "users:remove", args: { userId: BOB, roomId: ROOM_ID } },
    ]);
  });

  it("removes no one when the viewer cancels", () => {
    renderBoard(everyone());

    pressDelete(`player-${ADA}`);
    expect(dialog().getByText("Remove Ada?")).toBeDefined();
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }));

    expect(server.writes).toEqual([]);
  });

  it("asks nothing of a viewer who may remove no one", () => {
    const asParticipant = everyone();
    asParticipant.users[0] = member(ME, "Me");
    renderBoard(asParticipant);

    pressDelete(`player-${ADA}`, `player-${BOB}`);

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(server.writes).toEqual([]);
  });
});

describe("the nodes' controls", () => {
  it("reveal the cards from the session node", () => {
    renderBoard(roomData({ votes: [vote(ADA)] }));

    fireEvent.click(screen.getByRole("button", { name: "Reveal all votes" }));

    expect(server.writes).toEqual([{ name: "rooms:showCards", args: { roomId: ROOM_ID } }]);
  });

  it("cast the viewer's vote from a card", async () => {
    renderBoard();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Vote 5" })));

    expect(server.writes).toEqual([
      { name: "votes:pickCard", args: { roomId: ROOM_ID, userId: ME, cardLabel: "5" } },
    ]);
  });

  it("ask before the note's ✕ takes off a note with words in it, as Delete does", () => {
    withNote("Risks: auth");
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));

    expect(dialog().getByText("Delete note?")).toBeDefined();
    expect(server.writes).toEqual([]);
  });
});

describe("the raised card", () => {
  it("rises the moment the viewer picks it, before the server answers", async () => {
    renderBoard();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Vote 5" })));

    expect(raisedCards()).toEqual(["5"]);
  });

  it("comes down when a reset clears the viewer's vote, the card they clicked included", async () => {
    const { rerender } = renderBoard();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Vote 5" })));
    selectNode(cardNode("5").id);
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
    const before = node("note-1");

    rerender(roomData({ votes: [vote(ADA)] }));

    expect(node("session-current").data).toMatchObject({ voteCount: 1 });
    expect(node("note-1")).toBe(before);
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
