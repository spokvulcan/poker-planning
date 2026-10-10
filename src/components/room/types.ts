import { Node } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { SanitizedVote } from "@/convex/model/rooms";
import type { RoomUserData } from "@/convex/model/memberships";
import type { MemberRole, PokerPermissionCategory, ResolvedDecision } from "@/convex/permissions";
import type { Phase } from "@/convex/phase";
import type { TimerState } from "@/convex/timerState";
import type { CanvasActions } from "./hooks/useCanvasActions";

// Demo mode constants
export const DEMO_VIEWER_ID = "demo-viewer" as const;

/**
 * Everything a node on the poker board can ask for, behind one frozen-identity
 * object that rides in each node's data, as on the retro's board: no node gets
 * a handler of its own, so a node nothing changed keeps its object through the
 * whiteboard's merge and its memo holds. The board's adapter builds it over
 * the canvas writes, adding opening the issues; its `deleteNote` takes an
 * empty note off at once, and asks first when the note has words in it.
 */
export type PokerBoardActions = Pick<
  CanvasActions,
  "reveal" | "reset" | "toggleAutoComplete" | "cancelAutoReveal" | "selectCard" | "updateNoteContent" | "deleteNote"
> & {
  openIssues: () => void;
};

// Node data types
export type PlayerNodeData = {
  user: RoomUserData;
  isCurrentUser: boolean;
  isCardPicked: boolean;
  card: string | null;
  phase: Phase;
  role: MemberRole;
};

export type SessionNodeData = {
  sessionName: string;
  participantCount: number;
  voteCount: number;
  phase: Phase;
  hasVotes: boolean;
  autoCompleteVoting: boolean;
  /**
   * Rendering anchor for the ticking countdown display only — never a phase
   * branch. The ticking effect is additionally gated on `phase` being
   * `countingDown`, so a stale timestamp can never animate after reveal.
   */
  autoRevealCountdownStartedAt: number | null;
  currentIssue?: {
    id: Id<"issues">;
    title: string;
  } | null;
  /** The viewer's decision for each of the room's permission categories. */
  permissions: Record<PokerPermissionCategory, ResolvedDecision>;
  actions: PokerBoardActions;
};

// Persisted fields come from the single declaration in @/convex/timerState;
// this adds only the view-side extras the node needs to render and control.
export type TimerNodeData = TimerState & {
  isRunning: boolean; // required in the view — buildTimerNode defaults the persisted optional
  roomId: Id<"rooms">; // Room ID for timer controls
  userId?: Id<"users">; // Current user ID for timer controls
  nodeId: string; // Node ID for timer controls
};

export type VotingCardNodeData = {
  card: { value: string };
  userId: string;
  roomId: string;
  isSelectable: boolean;
  /** Whether this card is the viewer's vote: the one thing that raises it. */
  isSelected: boolean;
  actions: PokerBoardActions;
};

export type ResultsNodeData = {
  votes: SanitizedVote[];
  users: RoomUserData[];
  isNumericScale: boolean;
};

export type NoteNodeData = {
  issueId: Id<"issues">;
  issueTitle: string;
  content: string;
  lastUpdatedBy?: string; // User name who last edited
  lastUpdatedAt?: number;
  actions: PokerBoardActions;
};

// Node types
export type PlayerNodeType = Node<PlayerNodeData, "player">;
export type SessionNodeType = Node<SessionNodeData, "session">;
export type TimerNodeType = Node<TimerNodeData, "timer">;
export type VotingCardNodeType = Node<VotingCardNodeData, "votingCard">;
export type ResultsNodeType = Node<ResultsNodeData, "results">;
export type NoteNodeType = Node<NoteNodeData, "note">;

// Union type for all custom nodes
export type CustomNodeType =
  | PlayerNodeType
  | SessionNodeType
  | TimerNodeType
  | VotingCardNodeType
  | ResultsNodeType
  | NoteNodeType;