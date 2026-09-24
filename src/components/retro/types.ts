import type { Node } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionItemView, Gif, StickyView } from "@/convex/model/retro";
import type { ResolvedDecision } from "@/convex/permissions";
import type { RetroColumn, RetroStep, StickyColor } from "@/convex/retroTemplates";
import type { TimerNodeData } from "@/components/room/types";

/**
 * Every write the board can trigger, behind one frozen-identity object that
 * rides in each node's data (so node memos never churn on a new handler).
 */
export interface RetroBoardActions {
  startDraft: (columnId: string, at?: { x: number; y: number }) => void;
  commitDraft: (clientId: string, text: string, gif: Gif | undefined) => void;
  cancelDraft: (clientId: string) => void;
  startEdit: (stickyId: Id<"retroStickies">) => void;
  commitEdit: (stickyId: Id<"retroStickies">, text: string, gif: Gif | null) => void;
  cancelEdit: () => void;
  setGif: (stickyId: Id<"retroStickies">, gif: Gif | null) => void;
  deleteSticky: (stickyId: Id<"retroStickies">) => void;
  toggleVote: (stickyId: Id<"retroStickies">) => void;
  unstack: (stickyId: Id<"retroStickies">) => void;
  toggleExpanded: (stickyId: Id<"retroStickies">) => void;
  focusTopic: (stickyId: Id<"retroStickies">) => void;
  panToTopic: (stickyId: Id<"retroStickies">) => void;
  setStep: (step: RetroStep) => void;
  stepDiscussion: (direction: "next" | "previous") => void;
  startNext: () => void;
  copySummary: () => void;
  renameColumn: (columnId: string, title: string) => void;
  addActionItem: (text: string) => void;
  updateActionItem: (
    itemId: Id<"retroActionItems">,
    patch: { text?: string; done?: boolean; ownerId?: Id<"users"> | null }
  ) => void;
  deleteActionItem: (itemId: Id<"retroActionItems">) => void;
}

/** A person at the board, for owners and counts. */
export interface RetroMember {
  _id: Id<"users">;
  name: string;
  avatarUrl?: string;
}

export type RetroNodeData = {
  name: string;
  step: RetroStep;
  stickyCount: number;
  writers: number;
  participants: number;
  votesCast: number;
  votesPerPerson: number;
  myVotes: number;
  /** The walk: where the focus is (0-based, -1 when off the list) and how long it is. */
  topicIndex: number;
  topicCount: number;
  focusedId?: Id<"retroStickies">;
  focusedLabel?: string;
  nextRoomId?: Id<"rooms">;
  openActions: number;
  totalActions: number;
  canFlow: ResolvedDecision;
  actions: RetroBoardActions;
};

export type PadNodeData = {
  column: RetroColumn;
  count: number;
  canRename: boolean;
  actions: RetroBoardActions;
};

export type StickyNodeData = {
  /** The sticky as the viewer may see it; a draft has only the local fields. */
  sticky?: StickyView;
  draft?: { clientId: string; text: string; gif?: Gif };
  color: StickyColor;
  step: RetroStep;
  editing: boolean;
  /** The viewer may change what it says (theirs, or a facilitator's call). */
  canEdit: boolean;
  /** The other stickies in its stack, when this is a stack's top. */
  members: StickyView[];
  /** Every column's colour, for stacked stickies that came from another column. */
  columnColors: Readonly<Record<string, StickyColor>>;
  expanded: boolean;
  votesLeft: number;
  /** The topic's place in the discussion (1-based), when it has one. */
  rank?: number;
  focused: boolean;
  discussed: boolean;
  dimmed: boolean;
  dropTarget: boolean;
  canFocus: boolean;
  actions: RetroBoardActions;
};

export type ActionsNodeData = {
  items: ActionItemView[] | undefined;
  members: RetroMember[];
  canManage: ResolvedDecision;
  actions: RetroBoardActions;
};

export type RetroFlowNode =
  | Node<RetroNodeData, "retro">
  | Node<PadNodeData, "pad">
  | Node<StickyNodeData, "sticky">
  | Node<ActionsNodeData, "actions">
  | Node<TimerNodeData, "timer">;

export type StickyFlowNode = Node<StickyNodeData, "sticky">;
