import { Node } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { SanitizedVote } from "@/convex/model/rooms";
import type { RoomUserData } from "@/convex/model/users";
import type { MemberRole, ResolvedDecision } from "@/convex/permissions";
import type { Phase } from "@/convex/phase";
import type { TimerState } from "@/convex/timerState";

// Demo mode constants
export const DEMO_VIEWER_ID = "demo-viewer" as const;

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
  canRevealCards: ResolvedDecision;
  canControlGameFlow: ResolvedDecision;
  canChangeRoomSettings: ResolvedDecision;
  onRevealCards?: () => void;
  onResetGame?: () => void;
  onToggleAutoComplete?: () => void;
  onCancelAutoReveal?: () => void;
  onOpenIssuesPanel?: () => void;
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
  isSelected: boolean;
  onCardSelect?: (cardValue: string) => void;
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
  onUpdateContent: (content: string) => void;
  onDelete?: () => void;
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