/**
 * buildCanvasNodes / buildCanvasEdges — the pure canvas derivation (#229).
 *
 * These tests call the builders with plain values and assert on the returned
 * nodes and edges — never on how the module derived them, and never through
 * React (prior art: the demo simulation tests). The expected values are the
 * behavior the live canvas has always had; the extraction must be invisible
 * in use.
 */
import { describe, it, expect } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasNode } from "@/convex/model/canvas";
import type { SanitizedVote } from "@/convex/model/rooms";
import type { RoomUserData } from "@/convex/model/users";
import { RESOLVED_ALLOWED } from "@/convex/permissions";
import { computeVotingCardRow } from "@/convex/canvasLayout";
import { DEFAULT_SCALE } from "@/convex/scales";
import {
  DEMO_VIEWER_ID,
  type CustomNodeType,
  type VotingCardNodeType,
} from "../types";
import {
  buildCanvasEdges,
  buildCanvasNodes,
  isNoteForIssue,
  type CanvasEdgesInput,
  type CanvasNodesInput,
} from "./buildCanvasNodes";

const ROOM_ID = "room-1" as Id<"rooms">;
const ISSUE_ID = "issue-1" as Id<"issues">;

function member(id: string, overrides?: Partial<RoomUserData>): RoomUserData {
  return {
    _id: id as Id<"users">,
    name: `User ${id}`,
    isSpectator: false,
    role: "participant",
    joinedAt: 0,
    membershipId: `membership-${id}` as Id<"roomMemberships">,
    ...overrides,
  };
}

function playerCanvasNode(userId: string): CanvasNode {
  return {
    roomId: ROOM_ID,
    nodeId: `player-${userId}`,
    position: { x: 0, y: 0 },
    lastUpdatedAt: 0,
    type: "player",
    data: { userId: userId as Id<"users"> },
  };
}

function noteCanvasNode(
  issueId: Id<"issues">,
  nodeId = `note-${issueId}`,
  content = "",
): CanvasNode {
  return {
    roomId: ROOM_ID,
    nodeId,
    position: { x: 400, y: -200 },
    lastUpdatedAt: 0,
    type: "note",
    data: { issueId, issueTitle: "Issue title", content },
  };
}

function vote(userId: string, overrides?: Partial<SanitizedVote>): SanitizedVote {
  return {
    _id: `vote-${userId}` as Id<"votes">,
    _creationTime: 0,
    roomId: ROOM_ID,
    userId: userId as Id<"users">,
    hasVoted: true,
    ...overrides,
  };
}

function nodesInput(overrides?: Partial<CanvasNodesInput>): CanvasNodesInput {
  return {
    phase: "voting",
    roomId: ROOM_ID,
    room: {
      name: "Sprint 42",
      autoCompleteVoting: false,
      autoRevealCountdownStartedAt: null,
      votingScale: undefined,
    },
    members: [],
    votes: [],
    canvasNodes: [],
    currentIssue: null,
    viewerId: undefined,
    selectedCardValue: null,
    isDemoMode: false,
    canRevealCards: RESOLVED_ALLOWED,
    canControlGameFlow: RESOLVED_ALLOWED,
    canChangeRoomSettings: RESOLVED_ALLOWED,
    callbacks: {},
    ...overrides,
  };
}

function edgesInput(overrides?: Partial<CanvasEdgesInput>): CanvasEdgesInput {
  return {
    phase: "voting",
    members: [],
    canvasNodes: [],
    currentIssue: null,
    ...overrides,
  };
}

describe("buildCanvasEdges", () => {
  it("emits one session-to-player edge per member and the timer edge always", () => {
    const edges = buildCanvasEdges(
      edgesInput({
        members: [member("u1"), member("u2")],
        canvasNodes: [playerCanvasNode("u1"), playerCanvasNode("u2")],
      }),
    );

    const playerEdges = edges.filter((e) => e.id.startsWith("session-to-player-"));
    expect(playerEdges).toHaveLength(2);
    expect(playerEdges[0]).toMatchObject({
      id: "session-to-player-u1",
      source: "session-current",
      sourceHandle: "bottom",
      target: "player-u1",
      targetHandle: "top",
      type: "default",
    });
    expect(playerEdges[1].target).toBe("player-u2");

    expect(edges.filter((e) => e.id === "timer-to-session")).toHaveLength(1);
    expect(edges.find((e) => e.id === "timer-to-session")).toMatchObject({
      source: "timer",
      target: "session-current",
      type: "straight",
    });
  });

  it("emits the session-to-results edge only when the round is revealed", () => {
    const voting = buildCanvasEdges(edgesInput({ phase: "voting" }));
    const countingDown = buildCanvasEdges(edgesInput({ phase: "countingDown" }));
    const revealed = buildCanvasEdges(edgesInput({ phase: "revealed" }));

    expect(voting.find((e) => e.id === "session-to-results")).toBeUndefined();
    expect(countingDown.find((e) => e.id === "session-to-results")).toBeUndefined();
    expect(revealed.find((e) => e.id === "session-to-results")).toMatchObject({
      source: "session-current",
      sourceHandle: "right",
      target: "results",
      targetHandle: "left",
      type: "straight",
    });
  });

  it("emits the session-to-note edge targeting the current issue's note node", () => {
    const otherIssueId = "issue-2" as Id<"issues">;
    const edges = buildCanvasEdges(
      edgesInput({
        canvasNodes: [
          noteCanvasNode(otherIssueId, "note-other"),
          noteCanvasNode(ISSUE_ID, "note-current"),
        ],
        currentIssue: { _id: ISSUE_ID },
      }),
    );

    expect(edges.find((e) => e.id === "session-to-note")).toMatchObject({
      source: "session-current",
      target: "note-current",
      type: "straight",
    });
  });

  it("emits no note edge without a current issue or without a matching note", () => {
    const noIssue = buildCanvasEdges(
      edgesInput({ canvasNodes: [noteCanvasNode(ISSUE_ID)] }),
    );
    const noNote = buildCanvasEdges(
      edgesInput({
        canvasNodes: [noteCanvasNode("issue-2" as Id<"issues">)],
        currentIssue: { _id: ISSUE_ID },
      }),
    );

    expect(noIssue.find((e) => e.id === "session-to-note")).toBeUndefined();
    expect(noNote.find((e) => e.id === "session-to-note")).toBeUndefined();
  });
});

describe("buildCanvasNodes — player nodes", () => {
  it("builds a player node per persisted player with its member's data", () => {
    const alice = member("u1", { role: "owner" });
    const lockedNode = { ...playerCanvasNode("u1"), isLocked: true };
    const nodes = buildCanvasNodes(
      nodesInput({
        members: [alice],
        votes: [vote("u1")],
        canvasNodes: [lockedNode],
        viewerId: "u1" as Id<"users">,
      }),
    ).filter((n) => n.type === "player");

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "player-u1",
      type: "player",
      position: { x: 0, y: 0 },
      draggable: false,
      data: {
        user: alice,
        isCurrentUser: true,
        isCardPicked: true,
        card: null,
        phase: "voting",
        role: "owner",
      },
    });
  });

  it("shows the vote's card label only when the round is revealed", () => {
    const base = {
      members: [member("u1")],
      votes: [vote("u1", { cardLabel: "8" })],
      canvasNodes: [playerCanvasNode("u1")],
    };
    const phases = ["voting", "countingDown", "revealed"] as const;
    const [voting, countingDown, revealed] = phases.map(
      (phase) => buildCanvasNodes(nodesInput({ ...base, phase }))[0],
    );

    expect(voting.data).toMatchObject({ card: null, phase: "voting" });
    expect(countingDown.data).toMatchObject({ card: null, phase: "countingDown" });
    expect(revealed.data).toMatchObject({ card: "8", phase: "revealed" });
  });

  it("skips a persisted player node whose member is gone", () => {
    const nodes = buildCanvasNodes(
      nodesInput({ members: [], canvasNodes: [playerCanvasNode("u-gone")] }),
    );
    expect(nodes).toHaveLength(0);
  });
});

function sessionCanvasNode(): CanvasNode {
  return {
    roomId: ROOM_ID,
    nodeId: "session-current",
    position: { x: -140, y: -300 },
    lastUpdatedAt: 0,
    type: "session",
    data: {},
  };
}

describe("buildCanvasNodes — session node", () => {
  it("derives counts from members and votes, excluding spectators", () => {
    const nodes = buildCanvasNodes(
      nodesInput({
        members: [member("u1"), member("u2", { isSpectator: true }), member("u3")],
        votes: [vote("u1"), vote("u3", { hasVoted: false })],
        canvasNodes: [sessionCanvasNode()],
        currentIssue: { _id: ISSUE_ID, title: "Checkout flow" },
      }),
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "session-current",
      type: "session",
      data: {
        sessionName: "Sprint 42",
        participantCount: 2,
        voteCount: 1,
        hasVotes: true,
        phase: "voting",
        autoCompleteVoting: false,
        autoRevealCountdownStartedAt: null,
        currentIssue: { id: ISSUE_ID, title: "Checkout flow" },
      },
    });
  });

  it("passes resolved decisions through unaltered — allowed and denied alike", () => {
    const denied = { allowed: false as const, message: "Only the owner can do that" };
    const { data } = buildCanvasNodes(
      nodesInput({
        canvasNodes: [sessionCanvasNode()],
        canRevealCards: denied,
        canControlGameFlow: RESOLVED_ALLOWED,
        canChangeRoomSettings: denied,
      }),
    )[0];

    if (!("canRevealCards" in data)) throw new Error("expected session data");
    expect(data.canRevealCards).toBe(denied);
    expect(data.canControlGameFlow).toBe(RESOLVED_ALLOWED);
    expect(data.canChangeRoomSettings).toBe(denied);
  });

  it("wires the session callbacks through by reference", () => {
    const callbacks = {
      onRevealCards: () => {},
      onResetGame: () => {},
      onToggleAutoComplete: () => {},
      onCancelAutoReveal: () => {},
      onOpenIssuesPanel: () => {},
    };
    const { data } = buildCanvasNodes(
      nodesInput({ canvasNodes: [sessionCanvasNode()], callbacks }),
    )[0];

    if (!("canRevealCards" in data)) throw new Error("expected session data");
    expect(data.onRevealCards).toBe(callbacks.onRevealCards);
    expect(data.onResetGame).toBe(callbacks.onResetGame);
    expect(data.onToggleAutoComplete).toBe(callbacks.onToggleAutoComplete);
    expect(data.onCancelAutoReveal).toBe(callbacks.onCancelAutoReveal);
    expect(data.onOpenIssuesPanel).toBe(callbacks.onOpenIssuesPanel);
  });

  it("falls back to the default session name and null current issue", () => {
    const { data } = buildCanvasNodes(
      nodesInput({
        room: {
          name: "",
          autoCompleteVoting: true,
          autoRevealCountdownStartedAt: 12345,
        },
        canvasNodes: [sessionCanvasNode()],
      }),
    )[0];

    expect(data).toMatchObject({
      sessionName: "Planning Session",
      currentIssue: null,
      autoCompleteVoting: true,
      autoRevealCountdownStartedAt: 12345,
    });
  });
});

function resultsCanvasNode(): CanvasNode {
  return {
    roomId: ROOM_ID,
    nodeId: "results",
    position: { x: 400, y: -200 },
    lastUpdatedAt: 0,
    type: "results",
    data: {},
  };
}

describe("buildCanvasNodes — results node", () => {
  it("appears only when the round is revealed, with cast votes only", () => {
    const base = {
      members: [member("u1"), member("u2")],
      votes: [vote("u1", { cardLabel: "5" }), vote("u2", { hasVoted: false })],
      canvasNodes: [resultsCanvasNode()],
      room: {
        name: "Sprint 42",
        autoCompleteVoting: false,
        autoRevealCountdownStartedAt: null,
        votingScale: { cards: ["S", "M", "L"], isNumeric: false },
      },
    };

    const hidden = buildCanvasNodes(nodesInput({ ...base, phase: "voting" }));
    expect(hidden).toHaveLength(0);

    const shown = buildCanvasNodes(nodesInput({ ...base, phase: "revealed" }));
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ id: "results", type: "results" });
    if (!("isNumericScale" in shown[0].data)) throw new Error("expected results data");
    expect(shown[0].data.isNumericScale).toBe(false);
    expect(shown[0].data.votes).toEqual([base.votes[0]]);
    expect(shown[0].data.users).toBe(base.members);
  });

  it("defaults to a numeric scale when the room has none", () => {
    const nodes = buildCanvasNodes(
      nodesInput({ phase: "revealed", canvasNodes: [resultsCanvasNode()] }),
    );
    if (!("isNumericScale" in nodes[0].data)) throw new Error("expected results data");
    expect(nodes[0].data.isNumericScale).toBe(true);
  });
});

describe("buildCanvasNodes — note node", () => {
  it("shows only the note belonging to the current issue", () => {
    const nodes = buildCanvasNodes(
      nodesInput({
        canvasNodes: [
          noteCanvasNode("issue-2" as Id<"issues">, "note-other"),
          noteCanvasNode(ISSUE_ID, "note-current", "some content"),
        ],
        currentIssue: { _id: ISSUE_ID, title: "Checkout flow" },
      }),
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "note-current",
      type: "note",
      data: { issueId: ISSUE_ID, issueTitle: "Issue title", content: "some content" },
    });
  });

  it("hides every note when there is no current issue", () => {
    const nodes = buildCanvasNodes(
      nodesInput({ canvasNodes: [noteCanvasNode(ISSUE_ID)], currentIssue: null }),
    );
    expect(nodes).toHaveLength(0);
  });

  it("gives the note closures that capture its own node id and content state", () => {
    const updates: [string, string][] = [];
    const deletions: [string, boolean][] = [];
    const build = (content: string) =>
      buildCanvasNodes(
        nodesInput({
          canvasNodes: [noteCanvasNode(ISSUE_ID, "note-current", content)],
          currentIssue: { _id: ISSUE_ID, title: "Checkout flow" },
          callbacks: {
            onUpdateNoteContent: (nodeId, next) => updates.push([nodeId, next]),
            onDeleteNote: (nodeId, hasContent) => deletions.push([nodeId, hasContent]),
          },
        }),
      )[0];

    const withContent = build("draft").data;
    if (!("onUpdateContent" in withContent)) throw new Error("expected note data");
    withContent.onUpdateContent("edited");
    withContent.onDelete?.();

    const empty = build("").data;
    if (!("onUpdateContent" in empty)) throw new Error("expected note data");
    empty.onDelete?.();

    expect(updates).toEqual([["note-current", "edited"]]);
    expect(deletions).toEqual([
      ["note-current", true],
      ["note-current", false],
    ]);
  });
});

describe("buildCanvasNodes — timer node", () => {
  it("passes the persisted timer state through with sync identifiers", () => {
    const timerNode: CanvasNode = {
      roomId: ROOM_ID,
      nodeId: "timer",
      position: { x: -500, y: -250 },
      lastUpdatedAt: 0,
      type: "timer",
      data: {
        startedAt: 111,
        pausedAt: null,
        elapsedSeconds: 42,
        lastUpdatedBy: "u1" as Id<"users">,
        lastAction: "start",
      },
    };
    const nodes = buildCanvasNodes(
      nodesInput({ canvasNodes: [timerNode], viewerId: "u2" as Id<"users"> }),
    ).filter((n) => n.type === "timer");

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "timer",
      type: "timer",
      data: {
        startedAt: 111,
        pausedAt: null,
        elapsedSeconds: 42,
        isRunning: false,
        lastUpdatedBy: "u1",
        lastAction: "start",
        roomId: ROOM_ID,
        userId: "u2",
        nodeId: "timer",
      },
    });
  });
});

function votingCards(nodes: CustomNodeType[]): VotingCardNodeType[] {
  return nodes.filter((n): n is VotingCardNodeType => n.type === "votingCard");
}

describe("buildCanvasNodes — voting-card row", () => {
  const scale = { cards: ["1", "2", "3"], isNumeric: true };
  const roomWithScale = {
    name: "Sprint 42",
    autoCompleteVoting: false,
    autoRevealCountdownStartedAt: null,
    votingScale: scale,
  };
  const viewer = "u1" as Id<"users">;

  it("renders one selectable card per scale value for a participant viewer", () => {
    const onCardSelect = () => {};
    const nodes = buildCanvasNodes(
      nodesInput({
        room: roomWithScale,
        members: [member("u1")],
        viewerId: viewer,
        selectedCardValue: "2",
        callbacks: { onCardSelect },
      }),
    );

    const cards = votingCards(nodes);
    expect(cards.map((n) => n.id)).toEqual([
      "card-u1-0",
      "card-u1-1",
      "card-u1-2",
    ]);
    expect(cards.map((n) => n.position)).toEqual(computeVotingCardRow(3));
    expect(cards.map((n) => n.data.card.value)).toEqual(["1", "2", "3"]);
    expect(cards.map((n) => n.data.isSelected)).toEqual([false, true, false]);
    expect(cards.map((n) => n.selected)).toEqual([false, true, false]);
    expect(cards.every((n) => n.draggable === false)).toBe(true);
    expect(cards.every((n) => n.data.isSelectable)).toBe(true);
    expect(cards.every((n) => n.data.onCardSelect === onCardSelect)).toBe(true);
    expect(cards.every((n) => n.data.userId === viewer)).toBe(true);
    expect(cards.every((n) => n.data.roomId === ROOM_ID)).toBe(true);
  });

  it("uses the default scale when the room has none", () => {
    const nodes = buildCanvasNodes(nodesInput({ viewerId: viewer }));
    const cards = votingCards(nodes);
    expect(cards.map((n) => n.data.card.value)).toEqual([...DEFAULT_SCALE.cards]);
    expect(cards.map((n) => n.position)).toEqual(
      computeVotingCardRow(DEFAULT_SCALE.cards.length),
    );
  });

  it("never shows the row to a spectator, nor to an anonymous non-demo viewer", () => {
    const spectator = buildCanvasNodes(
      nodesInput({
        room: roomWithScale,
        members: [member("u1", { isSpectator: true })],
        viewerId: viewer,
      }),
    );
    const anonymous = buildCanvasNodes(nodesInput({ room: roomWithScale }));

    expect(spectator).toHaveLength(0);
    expect(anonymous).toHaveLength(0);
  });

  it("shows the row in demo mode under the demo viewer id, never selectable", () => {
    const onCardSelect = () => {};
    const nodes = buildCanvasNodes(
      nodesInput({
        room: roomWithScale,
        isDemoMode: true,
        callbacks: { onCardSelect },
      }),
    );

    const cards = votingCards(nodes);
    expect(cards.map((n) => n.id)).toEqual([
      `card-${DEMO_VIEWER_ID}-0`,
      `card-${DEMO_VIEWER_ID}-1`,
      `card-${DEMO_VIEWER_ID}-2`,
    ]);
    expect(cards.every((n) => n.data.isSelectable === false)).toBe(true);
    expect(cards.every((n) => n.data.onCardSelect === undefined)).toBe(true);
    expect(cards.every((n) => n.data.userId === DEMO_VIEWER_ID)).toBe(true);
  });

  it("suppresses selectability once the round is revealed", () => {
    const nodes = buildCanvasNodes(
      nodesInput({
        room: roomWithScale,
        members: [member("u1")],
        viewerId: viewer,
        phase: "revealed",
      }),
    );
    const cards = votingCards(nodes);
    expect(cards).toHaveLength(3);
    expect(cards.every((n) => n.data.isSelectable === false)).toBe(true);
  });
});

describe("isNoteForIssue", () => {
  it("matches only note nodes carrying the given issue id", () => {
    const note = noteCanvasNode(ISSUE_ID);
    expect(isNoteForIssue(note, ISSUE_ID)).toBe(true);
    expect(isNoteForIssue(note, "issue-2" as Id<"issues">)).toBe(false);
    expect(isNoteForIssue(note, undefined)).toBe(false);
    expect(isNoteForIssue(playerCanvasNode("u1"), ISSUE_ID)).toBe(false);
  });
});
