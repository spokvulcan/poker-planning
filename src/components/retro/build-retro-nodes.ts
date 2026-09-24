/**
 * buildRetroNodes / buildRetroEdges — the one place the retro whiteboard's
 * nodes and edges are derived from the board's state. Plain functions, no
 * React and no Convex, so what shows in which step is unit-testable.
 */
import type { Edge } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionItemView, BoardView, Gif, StickyView } from "@/convex/model/retro";
import type { CanvasNode } from "@/convex/model/canvas";
import type { ResolvedDecision } from "@/convex/permissions";
import type { RetroColumn, RetroStep } from "@/convex/retroTemplates";
import { discussionOrder } from "@/convex/retroRules";
import {
  actionsPosition,
  padPositions,
  RETRO_NODE_POSITION,
  RETRO_TIMER_POSITION,
} from "@/convex/retroLayout";
import type { RetroBoardActions, RetroFlowNode, RetroMember } from "./types";
import { isOptimistic } from "./optimistic";

export interface RetroNodesInput {
  roomId: Id<"rooms">;
  viewerId: Id<"users">;
  name: string;
  step: RetroStep;
  columns: readonly RetroColumn[];
  votesPerPerson: number;
  focusStickyId?: Id<"retroStickies">;
  nextRoomId?: Id<"rooms">;
  board: BoardView | undefined;
  items: ActionItemView[] | undefined;
  canvasNodes: CanvasNode[] | undefined;
  members: RetroMember[];
  draft: { clientId: string; columnId: string; position: { x: number; y: number }; text?: string; gif?: Gif } | null;
  editingId: Id<"retroStickies"> | null;
  expandedIds: ReadonlySet<string>;
  dropTargetId: string | null;
  canFlow: ResolvedDecision;
  canManageCards: ResolvedDecision;
  canManageActions: ResolvedDecision;
  canSettings: ResolvedDecision;
  actions: RetroBoardActions;
}

/** The discussion's order of topics, from the totals the board carries in Discuss. */
export function topicOrder(board: BoardView | undefined, columns: readonly RetroColumn[]): string[] {
  if (!board) return [];
  const totals = new Map(board.stickies.map((s) => [s._id as string, s.votes ?? 0]));
  return discussionOrder(board.stickies, totals, columns);
}

/** A short, readable label for a topic: its words, its GIF's title, or its face. */
export function topicLabel(sticky: StickyView | undefined): string | undefined {
  if (!sticky) return undefined;
  if (sticky.hidden) return "A face-down sticky";
  const text = sticky.text?.replace(/\s+/g, " ").trim();
  return text || sticky.gif?.title || "A GIF";
}

export function buildRetroNodes(input: RetroNodesInput): RetroFlowNode[] {
  const { board, columns, step, actions } = input;
  const stickies = board?.stickies ?? [];
  const positionOf = (nodeId: string) => input.canvasNodes?.find((n) => n.nodeId === nodeId)?.position;
  const defaultPads = padPositions(columns.length);
  const nodes: RetroFlowNode[] = [];

  // The walk: in Discuss and after, the topics in order and where it is.
  const discussing = step === "discuss" || step === "done";
  const order = discussing ? topicOrder(board, columns) : [];
  const focusIndex = input.focusStickyId ? order.indexOf(input.focusStickyId) : -1;
  const focused = stickies.find((s) => s._id === input.focusStickyId);
  const openActions = (input.items ?? []).filter((i) => !i.done).length;

  nodes.push({
    id: "retro",
    type: "retro",
    position: positionOf("retro") ?? RETRO_NODE_POSITION,
    data: {
      name: input.name,
      step,
      stickyCount: stickies.length,
      writers: board?.writers ?? 0,
      participants: input.members.length,
      votesCast: board?.votesCast ?? 0,
      votesPerPerson: input.votesPerPerson,
      myVotes: board?.myVotes ?? 0,
      topicIndex: focusIndex,
      topicCount: order.length,
      ...(input.focusStickyId && step === "discuss" ? { focusedId: input.focusStickyId } : {}),
      ...(step === "discuss" ? { focusedLabel: topicLabel(focused) } : {}),
      ...(input.nextRoomId ? { nextRoomId: input.nextRoomId } : {}),
      openActions,
      totalActions: input.items?.length ?? 0,
      canFlow: input.canFlow,
      actions,
    },
  });

  const timer = input.canvasNodes?.find((n) => n.nodeId === "timer" && n.type === "timer");
  if (timer && timer.type === "timer") {
    nodes.push({
      id: "timer",
      type: "timer",
      position: timer.position ?? RETRO_TIMER_POSITION,
      data: {
        ...timer.data,
        isRunning: timer.data.isRunning ?? false,
        roomId: input.roomId,
        userId: input.viewerId,
        nodeId: "timer",
      },
    });
  }

  const counts = new Map<string, number>();
  for (const s of stickies) counts.set(s.columnId, (counts.get(s.columnId) ?? 0) + 1);
  columns.forEach((column, i) => {
    nodes.push({
      id: `pad-${column.id}`,
      type: "pad",
      position: positionOf(`pad-${column.id}`) ?? defaultPads[i],
      data: { column, count: counts.get(column.id) ?? 0, canRename: input.canSettings.allowed, actions },
    });
  });

  nodes.push({
    id: "actions",
    type: "actions",
    position: positionOf("actions") ?? actionsPosition(columns.length),
    data: {
      items: input.items,
      members: input.members,
      canManage: input.canManageActions,
      actions,
    },
  });

  // Stickies: every topic (a loose sticky or a stack's top) is a node; a
  // stacked sticky lives inside its top.
  const colorOf = new Map(columns.map((c) => [c.id, c.color]));
  const columnColors = Object.fromEntries(colorOf);
  const membersOf = new Map<string, StickyView[]>();
  for (const s of stickies) {
    if (s.stackId) membersOf.set(s.stackId, [...(membersOf.get(s.stackId) ?? []), s]);
  }
  const votesLeft = input.votesPerPerson - (board?.myVotes ?? 0);
  for (const sticky of stickies) {
    if (sticky.stackId) continue;
    const pending = isOptimistic(sticky._id);
    // Nobody but the author touches a sticky before the reveal.
    const canEdit = !pending && (sticky.mine || (input.canManageCards.allowed && !sticky.hidden));
    const editing = input.editingId === sticky._id;
    const rank = order.indexOf(sticky._id);
    const isFocused = step === "discuss" && sticky._id === input.focusStickyId;
    nodes.push({
      id: sticky.clientId,
      type: "sticky",
      position: sticky.position,
      draggable: !editing && !pending,
      zIndex: isFocused ? 10 : undefined,
      data: {
        sticky,
        color: colorOf.get(sticky.columnId) ?? "yellow",
        step,
        editing,
        canEdit,
        members: (membersOf.get(sticky._id) ?? []).sort((a, b) => a.createdAt - b.createdAt),
        columnColors,
        expanded: input.expandedIds.has(sticky._id),
        votesLeft,
        ...(rank >= 0 ? { rank: rank + 1 } : {}),
        focused: isFocused,
        discussed: discussing && rank >= 0 && (step === "done" || (focusIndex >= 0 && rank < focusIndex)),
        dimmed: step === "discuss" && !!input.focusStickyId && !isFocused,
        dropTarget: input.dropTargetId === sticky.clientId,
        canFocus: input.canFlow.allowed && !pending,
        actions,
      },
    });
  }

  if (input.draft) {
    nodes.push({
      id: input.draft.clientId,
      type: "sticky",
      position: input.draft.position,
      draggable: false,
      zIndex: 20,
      data: {
        draft: { clientId: input.draft.clientId, text: input.draft.text ?? "", gif: input.draft.gif },
        color: colorOf.get(input.draft.columnId) ?? "yellow",
        step,
        editing: true,
        canEdit: true,
        members: [],
        columnColors,
        expanded: false,
        votesLeft,
        focused: false,
        discussed: false,
        dimmed: false,
        dropTarget: false,
        canFocus: false,
        actions,
      },
    });
  }

  return nodes;
}

const EDGE_STYLE = { stroke: "#64748b", strokeWidth: 2, strokeOpacity: 0.6 };
const DASHED = { ...EDGE_STYLE, strokeDasharray: "5,5" };

/** The connectors, as in the poker room: timer to retro, retro to each pad and to the action items. */
export function buildRetroEdges(columns: readonly RetroColumn[], hasTimer: boolean): Edge[] {
  const edges: Edge[] = columns.map((column) => ({
    id: `retro-to-pad-${column.id}`,
    source: "retro",
    sourceHandle: "bottom",
    target: `pad-${column.id}`,
    targetHandle: "top",
    type: "default",
    selectable: false,
    style: EDGE_STYLE,
  }));
  if (hasTimer) {
    edges.push({
      id: "timer-to-retro",
      source: "timer",
      sourceHandle: "right",
      target: "retro",
      targetHandle: "left",
      type: "straight",
      selectable: false,
      style: DASHED,
    });
  }
  edges.push({
    id: "retro-to-actions",
    source: "retro",
    sourceHandle: "right",
    target: "actions",
    targetHandle: "top",
    type: "default",
    selectable: false,
    style: { ...DASHED, stroke: "#10b981" },
  });
  return edges;
}
