/**
 * buildRetroNodes / buildRetroEdges — the one place the retro whiteboard's
 * nodes and edges are derived from the board's state. Plain functions, no
 * React and no Convex, so what shows in which step is unit-testable.
 */
import type { Edge } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionItemView, BoardView, RetroState, StickyView } from "@/convex/model/retro";
import type { CanvasNode } from "@/convex/model/canvas";
import type { ResolvedDecision, RetroPermissionCategory } from "@/convex/permissions";
import type { RetroColumn } from "@/convex/retroTemplates";
import { stepAllows, stepShows, stickyActAllowed, stickyEditDecision } from "@/convex/retroSteps";
import {
  actionsPosition,
  padNodeId,
  padPositions,
  RETRO_NODE_POSITION,
  STICKY_MIN_HEIGHT,
  STICKY_WIDTH,
} from "@/convex/retroLayout";
import { buildTimerNode } from "@/components/room/hooks/buildCanvasNodes";
import type { RetroBoardActions, RetroFlowNode, RetroMember } from "./types";
import { isOptimistic } from "./optimistic";
import { topicOrder } from "./board-view";

export interface RetroNodesInput {
  roomId: Id<"rooms">;
  viewerId: Id<"users">;
  name: string;
  retro: RetroState;
  /** The viewer's decision for each of the retro's permission categories. */
  perms: Record<RetroPermissionCategory, ResolvedDecision>;
  board: BoardView | undefined;
  /** Everyone's votes (counted while the retro is in Vote). */
  votesCast: number;
  items: ActionItemView[] | undefined;
  canvasNodes: CanvasNode[] | undefined;
  members: RetroMember[];
  draft: { clientId: string; columnId: string; position: { x: number; y: number } } | null;
  editingId: Id<"retroStickies"> | null;
  expandedIds: ReadonlySet<string>;
  actions: RetroBoardActions;
}

/**
 * A sticky's size until React Flow has measured it: without one, React Flow
 * keeps a new node hidden, and a draft's editor couldn't take focus.
 */
const STICKY_SIZE = { initialWidth: STICKY_WIDTH, initialHeight: STICKY_MIN_HEIGHT };

/** A short, readable label for a topic: its words, its GIF's title, or its face. */
export function topicLabel(sticky: StickyView | undefined): string | undefined {
  if (!sticky) return undefined;
  if (sticky.hidden) return "A face-down sticky";
  const text = sticky.text?.replace(/\s+/g, " ").trim();
  return text || sticky.gif?.title || "A GIF";
}

export function buildRetroNodes(input: RetroNodesInput): RetroFlowNode[] {
  const { board, retro, perms, actions } = input;
  const { columns, step } = retro;
  const shows = stepShows(step);
  const stickies = board?.stickies ?? [];
  const positionOf = (nodeId: string) => input.canvasNodes?.find((n) => n.nodeId === nodeId)?.position;
  const defaultPads = padPositions(columns.length);
  const nodes: RetroFlowNode[] = [];

  // The walk: once the totals show, the topics in the order they give and
  // where the spotlight is in it. While it runs, the topics it has passed are
  // discussed; once it's over, all of them.
  const order = shows.totals ? topicOrder(board, columns) : [];
  const focusIndex = retro.focusStickyId ? order.indexOf(retro.focusStickyId) : -1;
  const focused = stickies.find((s) => s._id === retro.focusStickyId);
  const walking = stepAllows(step, "walk").allowed;
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
      votesCast: input.votesCast,
      votesPerPerson: retro.votesPerPerson,
      myVotes: board?.myVotes ?? 0,
      topicIndex: focusIndex,
      topicCount: order.length,
      ...(retro.focusStickyId && shows.spotlight ? { focusedId: retro.focusStickyId } : {}),
      ...(shows.spotlight ? { focusedLabel: topicLabel(focused) } : {}),
      ...(retro.nextRoomId ? { nextRoomId: retro.nextRoomId } : {}),
      openActions,
      totalActions: input.items?.length ?? 0,
      canFlow: perms.stageFlow,
      actions,
    },
  });

  const timer = input.canvasNodes?.find((n): n is CanvasNode & { type: "timer" } => n.type === "timer");
  if (timer) nodes.push(buildTimerNode(timer, input));

  const counts = new Map<string, number>();
  for (const s of stickies) counts.set(s.columnId, (counts.get(s.columnId) ?? 0) + 1);
  columns.forEach((column, i) => {
    nodes.push({
      id: padNodeId(column.id),
      type: "pad",
      position: positionOf(padNodeId(column.id)) ?? defaultPads[i],
      data: { column, count: counts.get(column.id) ?? 0, canRename: perms.retroSettings.allowed, actions },
    });
  });

  nodes.push({
    id: "actions",
    type: "actions",
    position: positionOf("actions") ?? actionsPosition(columns.length),
    data: {
      items: input.items,
      members: input.members,
      canManage: perms.actionManagement,
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
  const votesLeft = retro.votesPerPerson - (board?.myVotes ?? 0);
  // What the step lets anyone do right now; who may do it is the permissions'.
  const canVote = stepAllows(step, "vote").allowed;
  const canSpotlight = stepAllows(step, "spotlight").allowed && perms.stageFlow.allowed;
  for (const sticky of stickies) {
    if (sticky.stackId) continue;
    const pending = isOptimistic(sticky._id);
    // Nobody but the author touches a sticky before the reveal.
    const canEdit = !pending && stickyEditDecision(step, sticky.mine, perms.cardManagement).allowed;
    const editing = input.editingId === sticky._id;
    const rank = order.indexOf(sticky._id);
    const isFocused = shows.spotlight && sticky._id === retro.focusStickyId;
    nodes.push({
      id: sticky.clientId,
      type: "sticky",
      position: sticky.position,
      ...STICKY_SIZE,
      draggable: !editing && !pending,
      zIndex: isFocused ? 10 : undefined,
      data: {
        sticky,
        color: colorOf.get(sticky.columnId) ?? "yellow",
        shows,
        editing,
        canEdit,
        members: (membersOf.get(sticky._id) ?? [])
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((member) => ({ ...member, canUnstack: !pending && stickyActAllowed(step, "unstack", member.mine).allowed })),
        columnColors,
        expanded: input.expandedIds.has(sticky._id),
        canVote: canVote && !pending,
        votesLeft,
        ...(rank >= 0 ? { rank: rank + 1 } : {}),
        focused: isFocused,
        discussed: rank >= 0 && (!walking || (focusIndex >= 0 && rank < focusIndex)),
        dimmed: shows.spotlight && !!retro.focusStickyId && !isFocused,
        canFocus: canSpotlight && !pending,
        actions,
      },
    });
  }

  if (input.draft) {
    nodes.push({
      id: input.draft.clientId,
      type: "sticky",
      position: input.draft.position,
      ...STICKY_SIZE,
      draggable: false,
      zIndex: 20,
      data: {
        draft: { clientId: input.draft.clientId },
        color: colorOf.get(input.draft.columnId) ?? "yellow",
        shows,
        editing: true,
        canEdit: true,
        members: [],
        columnColors,
        expanded: false,
        canVote: false,
        votesLeft,
        focused: false,
        discussed: false,
        dimmed: false,
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
    target: padNodeId(column.id),
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
