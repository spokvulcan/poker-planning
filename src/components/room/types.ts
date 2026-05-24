import { Node } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { SanitizedVote } from "@/convex/model/rooms";
import type { RoomUserData } from "@/convex/model/users";
import type { MemberRole, ResolvedDecision } from "@/convex/permissions";

// Demo mode constants
export const DEMO_VIEWER_ID = "demo-viewer" as const;

// Node data types
export type PlayerNodeData = {
  user: RoomUserData;
  isCurrentUser: boolean;
  isCardPicked: boolean;
  card: string | null;
  isGameOver: boolean;
  role: MemberRole;
};

export type StoryNodeData = {
  title: string;
  description: string;
  storyId: string;
  isGameOver?: boolean;
  hasVotes?: boolean;
  onRevealCards?: () => void;
  onResetGame?: () => void;
};

export type SessionNodeData = {
  sessionName: string;
  participantCount: number;
  voteCount: number;
  isVotingComplete: boolean;
  hasVotes: boolean;
  autoCompleteVoting: boolean;
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

export type TimerNodeData = {
  // Synchronized timer state fields
  startedAt: number | null; // Server timestamp when started
  pausedAt: number | null; // Server timestamp when paused
  elapsedSeconds: number; // Total elapsed seconds
  isRunning: boolean; // Current running state (derived from timestamps)
  
  // Tracking fields
  lastUpdatedBy: Id<"users"> | null; // User who last changed timer
  lastAction: "start" | "pause" | "reset" | null; // Last action performed
  
  // Required fields for timer synchronization
  roomId: Id<"rooms">; // Room ID for timer sync
  userId?: Id<"users">; // Current user ID for timer controls
  nodeId: string; // Node ID for timer sync
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
export type StoryNodeType = Node<StoryNodeData, "story">;
export type SessionNodeType = Node<SessionNodeData, "session">;
export type TimerNodeType = Node<TimerNodeData, "timer">;
export type VotingCardNodeType = Node<VotingCardNodeData, "votingCard">;
export type ResultsNodeType = Node<ResultsNodeData, "results">;
export type NoteNodeType = Node<NoteNodeData, "note">;

// Union type for all custom nodes
export type CustomNodeType =
  | PlayerNodeType
  | StoryNodeType
  | SessionNodeType
  | TimerNodeType
  | VotingCardNodeType
  | ResultsNodeType
  | NoteNodeType;