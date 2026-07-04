/**
 * buildCanvasNodes / buildCanvasEdges — the pure canvas derivation (#229).
 *
 * The ONE place the whiteboard's node and edge lists are derived from room
 * state: every node type, the voting-card row, phase-dependent visibility, and
 * decision-driven control disabling. Plain functions — no React, no Convex, no
 * demo context — so the phase-by-node-type matrix is unit-testable, and the
 * demo and live canvases are two callers of one implementation.
 *
 * Callers learn two builder interfaces (nodes, edges) plus one shared
 * note-for-issue predicate; the per-node-type helpers stay private. The
 * `useCanvasNodes` hook is the adapter that selects the data source
 * (Convex vs demo context), derives the phase, and memoizes.
 */
import type { Edge } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasNode } from "@/convex/model/canvas";
import type { SanitizedVote } from "@/convex/model/rooms";
import type { RoomUserData } from "@/convex/model/users";
import type { ResolvedDecision } from "@/convex/permissions";
import type { Phase } from "@/convex/phase";
import { computeVotingCardRow } from "@/convex/canvasLayout";
import { DEFAULT_SCALE } from "@/convex/scales";
import { DEMO_VIEWER_ID, type CustomNodeType } from "../types";

/** The room fields the nodes builder reads — a view, not the whole document. */
export interface CanvasRoomView {
  name: string;
  autoCompleteVoting: boolean;
  /**
   * Raw countdown-start timestamp, passed through solely as node data for the
   * session node's ticking display — never a phase branch (that is `phase`'s
   * job, derived once in the adapter via `phaseOf`).
   */
  autoRevealCountdownStartedAt: number | null;
  votingScale?: { cards: string[]; isNumeric: boolean };
}

/** The canvas-triggered handlers written into node data at construction time. */
export interface CanvasNodeCallbacks {
  onRevealCards?: () => void;
  onResetGame?: () => void;
  onCardSelect?: (cardValue: string) => void;
  onToggleAutoComplete?: () => void;
  onCancelAutoReveal?: () => void;
  onOpenIssuesPanel?: () => void;
  onUpdateNoteContent?: (nodeId: string, content: string) => void;
  onDeleteNote?: (nodeId: string, hasContent: boolean) => void;
}

/**
 * Input to {@link buildCanvasNodes}. The adapter assembles this fresh per
 * memo run from individual fields; the module never branches on raw round
 * fields — `phase` is the only lifecycle signal.
 */
export interface CanvasNodesInput {
  phase: Phase;
  roomId: Id<"rooms">;
  room: CanvasRoomView;
  members: RoomUserData[];
  votes: SanitizedVote[];
  canvasNodes: CanvasNode[];
  currentIssue: { _id: Id<"issues">; title: string } | null;
  /** The viewing user; undefined for anonymous demo viewers. */
  viewerId?: Id<"users">;
  selectedCardValue: string | null;
  isDemoMode: boolean;
  canRevealCards: ResolvedDecision;
  canControlGameFlow: ResolvedDecision;
  canChangeRoomSettings: ResolvedDecision;
  callbacks: CanvasNodeCallbacks;
}

/**
 * Input to {@link buildCanvasEdges} — deliberately a strict subset of the
 * nodes input: phase, members, canvas nodes, and the current issue are the
 * only fields the edge rules ever read, so the adapter's edges memo can stop
 * recomputing on unrelated room-data changes.
 */
export interface CanvasEdgesInput {
  phase: Phase;
  members: RoomUserData[];
  canvasNodes: CanvasNode[];
  currentIssue: { _id: Id<"issues"> } | null;
}

// --- Nodes builder -----------------------------------------------------------

/**
 * Derives the full node list from one room snapshot: each persisted canvas
 * node hydrated with live data, plus the client-generated voting-card row.
 */
export function buildCanvasNodes(input: CanvasNodesInput): CustomNodeType[] {
  const allNodes: CustomNodeType[] = [];

  input.canvasNodes.forEach((node) => {
    if (node.type === "player") {
      const playerNode = buildPlayerNode(node, input);
      if (playerNode) allNodes.push(playerNode);
    } else if (node.type === "timer") {
      allNodes.push(buildTimerNode(node, input));
    } else if (node.type === "session") {
      allNodes.push(buildSessionNode(node, input));
    } else if (node.type === "results" && input.phase === "revealed") {
      allNodes.push(buildResultsNode(node, input));
    } else if (isNoteForIssue(node, input.currentIssue?._id)) {
      allNodes.push(buildNoteNode(node, input));
    }
  });

  allNodes.push(...buildVotingCardRow(input));

  return allNodes;
}

/**
 * The client-generated voting-card row: shown to non-spectator members, and to
 * the anonymous demo viewer (where the cards are display-only — never
 * selectable, no select handler).
 */
function buildVotingCardRow(input: CanvasNodesInput): CustomNodeType[] {
  const shouldShowVotingCards = input.viewerId
    ? !input.members.find((u) => u._id === input.viewerId)?.isSpectator
    : input.isDemoMode;
  if (!shouldShowVotingCards) return [];

  const cards = input.room.votingScale?.cards ?? DEFAULT_SCALE.cards;
  const cardPositions = computeVotingCardRow(cards.length);
  const effectiveUserId = input.viewerId ?? DEMO_VIEWER_ID;

  return cards.map((cardValue, index) => ({
    id: `card-${effectiveUserId}-${index}`,
    type: "votingCard",
    position: cardPositions[index],
    data: {
      card: { value: cardValue },
      userId: effectiveUserId,
      roomId: input.roomId,
      isSelectable: input.phase !== "revealed" && !input.isDemoMode,
      isSelected: cardValue === input.selectedCardValue,
      onCardSelect: input.isDemoMode ? undefined : input.callbacks.onCardSelect,
    },
    selected: cardValue === input.selectedCardValue,
    draggable: false,
  }));
}

function buildPlayerNode(
  node: CanvasNode & { type: "player" },
  input: CanvasNodesInput,
): CustomNodeType | null {
  const userId = node.data.userId;
  const user = input.members.find((u) => u._id === userId);
  if (!user) return null;

  const userVote = input.votes.find((v) => v.userId === userId);

  return {
    id: node.nodeId,
    type: "player",
    position: node.position,
    data: {
      user,
      isCurrentUser: userId === input.viewerId,
      isCardPicked: userVote?.hasVoted || false,
      card: input.phase === "revealed" ? userVote?.cardLabel || null : null,
      phase: input.phase,
      role: user.role ?? "participant",
    },
    draggable: !node.isLocked,
  };
}

function buildTimerNode(
  node: CanvasNode & { type: "timer" },
  input: CanvasNodesInput,
): CustomNodeType {
  return {
    id: node.nodeId,
    type: "timer",
    position: node.position,
    data: {
      ...node.data,
      isRunning: node.data.isRunning ?? false,
      roomId: input.roomId,
      userId: input.viewerId,
      nodeId: node.nodeId,
    },
    draggable: !node.isLocked,
  };
}

function buildSessionNode(
  node: CanvasNode & { type: "session" },
  input: CanvasNodesInput,
): CustomNodeType {
  const { room, members, votes, currentIssue, callbacks } = input;
  return {
    id: node.nodeId,
    type: "session",
    position: node.position,
    data: {
      sessionName: room.name || "Planning Session",
      participantCount: members.filter((u) => !u.isSpectator).length,
      voteCount: votes.filter((v) => v.hasVoted).length,
      phase: input.phase,
      hasVotes: votes.some((v) => v.hasVoted),
      autoCompleteVoting: room.autoCompleteVoting,
      autoRevealCountdownStartedAt: room.autoRevealCountdownStartedAt,
      currentIssue: currentIssue
        ? { id: currentIssue._id, title: currentIssue.title }
        : null,
      canRevealCards: input.canRevealCards,
      canControlGameFlow: input.canControlGameFlow,
      canChangeRoomSettings: input.canChangeRoomSettings,
      onRevealCards: callbacks.onRevealCards,
      onResetGame: callbacks.onResetGame,
      onToggleAutoComplete: callbacks.onToggleAutoComplete,
      onCancelAutoReveal: callbacks.onCancelAutoReveal,
      onOpenIssuesPanel: callbacks.onOpenIssuesPanel,
    },
    draggable: !node.isLocked,
  };
}

function buildResultsNode(
  node: CanvasNode & { type: "results" },
  input: CanvasNodesInput,
): CustomNodeType {
  return {
    id: node.nodeId,
    type: "results",
    position: node.position,
    data: {
      votes: input.votes.filter((v) => v.hasVoted),
      users: input.members,
      isNumericScale: input.room.votingScale?.isNumeric ?? true,
    },
    draggable: !node.isLocked,
  };
}

function buildNoteNode(
  node: CanvasNode & { type: "note" },
  input: CanvasNodesInput,
): CustomNodeType {
  const { callbacks } = input;
  const noteContent = node.data.content || "";
  // The only per-node closures in the derivation: they must capture this
  // node's identifier. Never part of a memo dependency array.
  const nodeId = node.nodeId;
  return {
    id: nodeId,
    type: "note",
    position: node.position,
    data: {
      issueId: node.data.issueId,
      issueTitle: node.data.issueTitle || input.currentIssue?.title || "",
      content: noteContent,
      lastUpdatedBy: node.data.lastUpdatedBy,
      lastUpdatedAt: node.data.lastUpdatedAt,
      onUpdateContent: (content: string) => {
        callbacks.onUpdateNoteContent?.(nodeId, content);
      },
      onDelete: () => {
        callbacks.onDeleteNote?.(nodeId, !!noteContent);
      },
    },
    draggable: !node.isLocked,
  };
}

/**
 * The ONE implementation of "is this persisted node the note for that issue?"
 * — shared by the nodes builder, the edges builder, and the adapter's
 * `hasNoteForCurrentIssue`, so the three former copies cannot drift.
 */
export function isNoteForIssue(
  node: CanvasNode,
  issueId: Id<"issues"> | undefined,
): node is CanvasNode & { type: "note" } {
  return (
    node.type === "note" && issueId !== undefined && node.data.issueId === issueId
  );
}

/** Derives the edge list: which connectors exist and where they attach. */
export function buildCanvasEdges(input: CanvasEdgesInput): Edge[] {
  const { members } = input;
  const allEdges: Edge[] = [];

  // Session to Players edges (subtle, consistent with timer edge)
  members.forEach((user) => {
    allEdges.push({
      id: `session-to-player-${user._id}`,
      source: "session-current",
      sourceHandle: "bottom",
      target: `player-${user._id}`,
      targetHandle: "top",
      type: "default",
      animated: false,
      style: {
        stroke: "#64748b",
        strokeWidth: 2,
        strokeOpacity: 0.6,
      },
    });
  });

  // Session to Results edge (once the round is revealed)
  if (input.phase === "revealed") {
    allEdges.push({
      id: "session-to-results",
      source: "session-current",
      sourceHandle: "right",
      target: "results",
      targetHandle: "left",
      type: "straight",
      animated: false,
      style: {
        stroke: "#10b981",
        strokeWidth: 2,
        strokeDasharray: "5,5",
        strokeOpacity: 0.6,
      },
    });
  }

  // Timer to Session edge
  allEdges.push({
    id: "timer-to-session",
    source: "timer",
    sourceHandle: "right",
    target: "session-current",
    targetHandle: "left",
    type: "straight",
    animated: false,
    style: {
      stroke: "#64748b",
      strokeWidth: 2,
      strokeDasharray: "5,5",
      strokeOpacity: 0.6,
    },
  });

  // Session to Note edge (when current issue has a note)
  const noteNode = input.canvasNodes.find((n) =>
    isNoteForIssue(n, input.currentIssue?._id),
  );
  if (noteNode) {
    allEdges.push({
      id: "session-to-note",
      source: "session-current",
      sourceHandle: "right",
      target: noteNode.nodeId,
      targetHandle: "left",
      type: "straight",
      animated: false,
      style: {
        stroke: "#f59e0b", // Amber color matching note node
        strokeWidth: 2,
        strokeDasharray: "5,5",
        strokeOpacity: 0.6,
      },
    });
  }

  return allEdges;
}
