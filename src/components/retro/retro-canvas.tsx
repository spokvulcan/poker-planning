"use client";

import { useReactFlow, useStore, type NodeTypes, type ReactFlowState, type XYPosition } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { isEqual } from "lodash";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ClipboardCopy, Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { RetroStep } from "@/convex/retroTemplates";
import { stepShows, stickyActAllowed } from "@/convex/retroSteps";
import { nextStickyPosition, PAD_WIDTH, padNodeId, STICKY_MIN_HEIGHT, STICKY_WIDTH } from "@/convex/retroLayout";
import { CanvasNavigation } from "@/components/room/canvas-navigation";
import { TimerNode } from "@/components/room/nodes/TimerNode";
import { usePanelState } from "@/components/room/hooks/usePanelState";
import { Whiteboard, WhiteboardProviders, centerOn, type WhiteboardDrop } from "@/components/whiteboard/whiteboard";
import { useRetroPermissions } from "@/hooks/usePermissions";
import { useStableActions } from "@/hooks/useStableActions";
import { toast } from "@/lib/toast";
import { runAct } from "@/lib/run-act";
import { copyTextToClipboard } from "@/utils/copy-text-to-clipboard";
import { downloadFile } from "@/utils/download-file";
import { RetroNode } from "./nodes/retro-node";
import { PadNode } from "./nodes/pad-node";
import { StickyNode } from "./nodes/sticky-node";
import { ActionsNode } from "./nodes/actions-node";
import { RetroSettingsPanel } from "./retro-settings-panel";
import { buildRetroEdges, buildRetroNodes } from "./build-retro-nodes";
import { topicOrder } from "./board-view";
import { buildRetroSummary } from "./retro-summary";
import { freshHeights, type MeasuredSticky } from "./sticky-heights";
import { useRetroMutations } from "./use-retro-mutations";
import { isOptimistic } from "./optimistic";
import type { RetroBoardActions, RetroFlowNode, StickyFlowNode } from "./types";

// Outside the component so React Flow sees a stable object.
const nodeTypes: NodeTypes = {
  retro: RetroNode,
  pad: PadNode,
  sticky: StickyNode,
  actions: ActionsNode,
  timer: TimerNode,
};

const FAILED = "That didn't go through. Try again.";
const MOVE_FAILED = "That move didn't save.";

interface RetroCanvasProps {
  roomData: RoomWithRelatedData;
  currentUserId: Id<"users">;
}

type Draft = {
  clientId: string;
  columnId: string;
  position: { x: number; y: number };
};

/** The viewer's stickies as React Flow measured them. */
function measuredStickies(state: ReactFlowState): MeasuredSticky[] {
  return (state.nodes as RetroFlowNode[]).flatMap((node) => {
    if (node.type !== "sticky" || !node.data.sticky?.mine || isOptimistic(node.data.sticky._id)) return [];
    const open = Boolean(node.data.editing || node.data.expanded);
    return [{ stickyId: node.data.sticky._id, height: Math.round(node.measured?.height ?? 0), open }];
  });
}

/**
 * While writing, a sticky is face-up only in its author's browser, so that
 * browser records how tall each of its own is drawn, for the reveal to move
 * stickies clear of the ones that turn out taller (ADR-0027).
 */
function StickyHeights({ onHeights }: { onHeights: (heights: { stickyId: Id<"retroStickies">; height: number }[]) => void }) {
  // Compared by value, so it changes only when a measurement does.
  const measured = useStore(measuredStickies, isEqual);
  const seen = useRef(new Map<string, number>());
  const sent = useRef(new Map<string, number>());
  useEffect(() => {
    if (measured.length === 0) return;
    const heights = freshHeights(measured, seen.current, sent.current);
    if (heights.length > 0) onHeights(heights);
  }, [measured, onHeights]);
  return null;
}

/**
 * The retro's adapter onto the whiteboard: its nodes, and what its gestures
 * mean. A sticky dropped on another stacks, any other drop is a move, Delete
 * takes off the stickies the viewer may remove, and a double-click writes a
 * sticky where it lands. The board follows the spotlight wherever the step
 * draws it.
 */
function RetroCanvasInner({ roomData, currentUserId }: RetroCanvasProps): ReactElement {
  const router = useRouter();
  const { room } = roomData;
  const roomId = room._id;
  const retro = room.retro!;
  const perms = useRetroPermissions(roomData, currentUserId);
  const flow = useReactFlow<RetroFlowNode>();

  const board = useQuery(api.retro.board, { roomId });
  // Everyone's vote count shows only while voting.
  const votesCast = useQuery(api.retro.votesCast, retro.step === "vote" ? { roomId } : "skip");
  const items = useQuery(api.retro.actionItems, { roomId });
  const canvasNodes = useQuery(api.canvas.getCanvasNodes, { roomId });
  const m = useRetroMutations(roomId);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<Id<"retroStickies"> | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const { isSettingsOpen, openSettings, closeAll } = usePanelState();

  // The tab is titled by the retro (the route's metadata can only say "room").
  useEffect(() => {
    const title = `${room.name} | AgileKit`;
    if (document.title !== title) document.title = title;
  });

  const stickyOf = (id: string) => board?.stickies.find((s) => s._id === id);

  /** The retro as Markdown, from what this viewer can see right now. */
  const summary = (): { markdown: string; slug: string } | null => {
    if (!board) return null;
    const markdown = buildRetroSummary({
      name: room.name,
      createdAt: room.createdAt,
      step: retro.step,
      columns: retro.columns,
      stickies: board.stickies,
      topics: topicOrder(board, retro.columns),
      actionItems: items ?? [],
    });
    const slug = room.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "retro";
    return { markdown, slug };
  };

  const copySummary = async () => {
    const current = summary();
    if (!current) return;
    if (await copyTextToClipboard(current.markdown)) {
      toast.success("Summary copied", { description: "Paste it into Slack, Confluence or a ticket." });
    } else {
      toast.error("Couldn't copy the summary");
    }
  };

  // Everything a node can ask for, frozen: node data never churns on a handler.
  const actions = useStableActions<RetroBoardActions>({
    startDraft: (columnId, at) => {
      const pad = flow.getNode(padNodeId(columnId));
      let position = at;
      if (!position) {
        const boxes = flow
          .getNodes()
          .filter((n): n is StickyFlowNode => n.type === "sticky")
          .map((n) => ({ position: n.position, height: n.measured?.height ?? STICKY_MIN_HEIGHT }));
        position = nextStickyPosition(pad?.position ?? { x: 0, y: 0 }, boxes);
      }
      const clientId = crypto.randomUUID();
      setEditingId(null);
      setDraft({ clientId, columnId, position });
      // Bring the new sticky into view if it landed off screen: the
      // smallest pan that shows it whole, at the zoom the person chose.
      const { x, y, zoom } = flow.getViewport();
      const margin = 96;
      const topLeft = flow.flowToScreenPosition(position);
      const bottomRight = flow.flowToScreenPosition({ x: position.x + STICKY_WIDTH, y: position.y + STICKY_MIN_HEIGHT * 1.6 });
      const dx =
        topLeft.x < margin ? margin - topLeft.x : bottomRight.x > window.innerWidth - margin ? window.innerWidth - margin - bottomRight.x : 0;
      const dy =
        topLeft.y < margin ? margin - topLeft.y : bottomRight.y > window.innerHeight - margin ? window.innerHeight - margin - bottomRight.y : 0;
      if (dx !== 0 || dy !== 0) void flow.setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 300 });
    },
    commitDraft: (clientId, text, gif) => {
      if (!draft || draft.clientId !== clientId) return;
      setDraft(null);
      void runAct(
        m.addSticky({ roomId, clientId, columnId: draft.columnId, text, position: draft.position, ...(gif ? { gif } : {}) }),
        "That sticky didn't stick. Try again."
      );
    },
    cancelDraft: (clientId) => setDraft((d) => (d?.clientId === clientId ? null : d)),
    startEdit: (stickyId) => {
      setDraft(null);
      setEditingId(stickyId);
    },
    commitEdit: (stickyId, text, gif) => {
      setEditingId(null);
      const sticky = stickyOf(stickyId);
      if (!sticky) return;
      const gifChanged = (gif?.url ?? null) !== (sticky.gif?.url ?? null);
      if (text.trim() === (sticky.text ?? "") && !gifChanged) return;
      void runAct(
        m.updateSticky({ stickyId, text, ...(gifChanged ? { gif } : {}) }),
        "That edit didn't save. Try again."
      );
    },
    cancelEdit: () => setEditingId(null),
    deleteSticky: (stickyId) => void runAct(m.deleteSticky({ stickyId }), "That sticky didn't come off. Try again."),
    toggleVote: (stickyId) => void runAct(m.toggleVote({ stickyId }), "That vote didn't count. Try again."),
    unstack: (stickyId) => {
      const sticky = stickyOf(stickyId);
      const top = sticky?.stackId ? stickyOf(sticky.stackId) : undefined;
      const from = top?.position ?? sticky?.position ?? { x: 0, y: 0 };
      void runAct(
        m.unstackSticky({ stickyId, position: { x: from.x + STICKY_WIDTH + 24, y: from.y } }),
        FAILED
      );
    },
    toggleExpanded: (stickyId) =>
      setExpandedIds((ids) => {
        const next = new Set(ids);
        if (next.has(stickyId)) next.delete(stickyId);
        else next.add(stickyId);
        return next;
      }),
    focusTopic: (stickyId) => void runAct(m.focusTopic({ roomId, stickyId }), FAILED),
    panToTopic: (stickyId) => {
      const sticky = stickyOf(stickyId);
      if (sticky) centerOn(flow, sticky.clientId);
    },
    setStep: (step: RetroStep) => void runAct(m.setStep({ roomId, step }), FAILED),
    stepDiscussion: (direction) => void runAct(m.stepDiscussion({ roomId, direction }), FAILED),
    startNext: async () => {
      try {
        const next = await m.startNext({ roomId });
        router.push(`/room/${next}`);
      } catch {
        toast.error("Couldn't start the next retro. Try again.");
      }
    },
    copySummary: () => void copySummary(),
    renameColumn: (columnId, title) => runAct(m.updateColumn({ roomId, columnId, title }), FAILED),
    addActionItem: (text) => void runAct(m.addActionItem({ roomId, text }), "That action item didn't save."),
    // A pending item offers nothing to click (see ActionRow), so these only see saved ones.
    updateActionItem: (itemId, patch) => void runAct(m.updateActionItem({ itemId, ...patch }), FAILED),
    deleteActionItem: (itemId) => void runAct(m.deleteActionItem({ itemId }), FAILED),
  });

  // What the board's gestures mean here, frozen like the node actions.
  const gestures = useStableActions({
    // A sticky dropped on a sticky it may join stacks with it.
    canDropOn: (dragged: RetroFlowNode, target: RetroFlowNode) =>
      dragged.type === "sticky" &&
      target.type === "sticky" &&
      !!dragged.data.sticky &&
      !!target.data.sticky &&
      !isOptimistic(target.data.sticky._id) &&
      stickyActAllowed(retro.step, "stack", dragged.data.sticky.mine && target.data.sticky.mine).allowed,
    onDrop: ({ nodes, target }: WhiteboardDrop<RetroFlowNode>) => {
      const [only] = nodes;
      if (target?.type === "sticky" && target.data.sticky && only?.type === "sticky" && only.data.sticky) {
        void runAct(
          m.stackSticky({ stickyId: only.data.sticky._id, ontoId: target.data.sticky._id }),
          "Those didn't stack. Try again."
        );
        return;
      }
      const stickyMoves = nodes.flatMap((node) =>
        node.type === "sticky" && node.data.sticky && !isOptimistic(node.data.sticky._id)
          ? [{ stickyId: node.data.sticky._id, position: node.position }]
          : []
      );
      if (stickyMoves.length > 0) void runAct(m.moveStickies({ roomId, moves: stickyMoves }), MOVE_FAILED);
      const nodeMoves = nodes.flatMap((node) => (node.type === "sticky" ? [] : [{ nodeId: node.id, position: node.position }]));
      if (nodeMoves.length > 0) {
        void runAct(m.moveNodes({ roomId, moves: nodeMoves, userId: currentUserId }), MOVE_FAILED);
      }
    },
    // Delete on a selection takes off only the stickies the viewer may remove.
    onDeleteNodes: (nodes: RetroFlowNode[]) => {
      for (const node of nodes) {
        if (node.type === "sticky" && node.data.sticky && node.data.canEdit) actions.deleteSticky(node.data.sticky._id);
      }
    },
    // Double-click anywhere: a sticky right there, in the column whose pad is nearest.
    onPaneDoubleClick: (at: XYPosition) => {
      const pads = flow.getNodes().filter((n) => n.type === "pad");
      if (pads.length === 0) return;
      const nearest = pads.reduce((best, pad) =>
        Math.abs(pad.position.x + PAD_WIDTH / 2 - at.x) < Math.abs(best.position.x + PAD_WIDTH / 2 - at.x) ? pad : best
      );
      if (nearest.type === "pad") actions.startDraft(nearest.data.column.id, { x: at.x - STICKY_WIDTH / 2, y: at.y - 24 });
    },
    setSettingsOpen: (open: boolean) => (open ? openSettings() : closeAll()),
    downloadSummary: () => {
      const current = summary();
      if (current) downloadFile(current.markdown, `${current.slug}.md`, "text/markdown");
    },
    measureStickies: (heights: { stickyId: Id<"retroStickies">; height: number }[]) =>
      void m
        .measureStickies({ roomId, heights })
        .catch((error) => console.error("Failed to record sticky heights:", error)),
  });

  // Nothing until the board and its fixed nodes have both arrived, so the
  // first fit takes in the whole board.
  const nodes = useMemo(
    () =>
      board && canvasNodes
        ? buildRetroNodes({
            roomId,
            viewerId: currentUserId,
            name: room.name,
            retro,
            perms,
            board,
            votesCast: votesCast ?? 0,
            items,
            canvasNodes,
            members: roomData.users,
            draft,
            editingId,
            expandedIds,
            actions,
          })
        : [],
    [roomId, currentUserId, room.name, retro, perms, board, votesCast, items, canvasNodes, roomData.users, draft, editingId, expandedIds, actions]
  );
  const edges = useMemo(
    () => buildRetroEdges(retro.columns, !!canvasNodes?.some((n) => n.nodeId === "timer")),
    [retro.columns, canvasNodes]
  );

  // The spotlight: wherever the step draws it, everyone's view follows it.
  const spotlit =
    stepShows(retro.step).spotlight && retro.focusStickyId ? stickyOf(retro.focusStickyId)?.clientId : undefined;

  const shareActions = useMemo(
    () => [
      { label: "Copy summary", icon: ClipboardCopy, onSelect: actions.copySummary },
      { label: "Download Markdown", icon: Download, onSelect: gestures.downloadSummary },
    ],
    [actions, gestures]
  );

  return (
    <Whiteboard
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onDrop={gestures.onDrop}
      canDropOn={gestures.canDropOn}
      onDeleteNodes={gestures.onDeleteNodes}
      onPaneDoubleClick={gestures.onPaneDoubleClick}
      followNodeId={spotlit}
      className="bg-white dark:bg-surface-1"
      testId="retro-board"
      navigation={
        <CanvasNavigation
          roomData={roomData}
          isSettingsOpen={isSettingsOpen}
          onSettingsPanelChange={gestures.setSettingsOpen}
          shareActions={shareActions}
        />
      }
      overlay={
        <>
          <StickyHeights onHeights={gestures.measureStickies} />
          {board && board.stickies.length === 0 && !draft && retro.step === "write" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
              <p className="rounded-full bg-white/95 px-4 py-2 text-sm text-gray-600 shadow-lg ring-1 ring-foreground/10 backdrop-blur-sm dark:bg-surface-1/95 dark:text-gray-300">
                Click a pad to write a sticky (GIFs welcome), or double-click anywhere on the board.
              </p>
            </div>
          )}
        </>
      }
      panels={
        <RetroSettingsPanel
          roomData={roomData}
          currentUserId={currentUserId}
          isOpen={isSettingsOpen}
          onClose={closeAll}
          onCopySummary={actions.copySummary}
        />
      }
    />
  );
}

/**
 * The retro whiteboard: the poker room's canvas, chrome and node vocabulary,
 * with a retro node, a sticky pad per column, stickies and the action
 * items on it. One presence subscription per viewer, as in the poker room.
 */
export function RetroCanvas(props: RetroCanvasProps): ReactElement {
  return (
    <WhiteboardProviders
      presence={{ roomId: props.roomData.room._id, userId: props.currentUserId, users: props.roomData.users }}
    >
      <RetroCanvasInner {...props} />
    </WhiteboardProviders>
  );
}
