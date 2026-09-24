"use client";

import {
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState, type ReactElement, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { isEqual } from "lodash";
import { ClipboardCopy, Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { RetroStep } from "@/convex/retroTemplates";
import { nextStickyPosition, PAD_WIDTH, padNodeId, STICKY_MIN_HEIGHT, STICKY_WIDTH } from "@/convex/retroLayout";
import { CanvasDotsBackground } from "@/components/canvas-dots-background";
import { CanvasNavigation } from "@/components/room/canvas-navigation";
import { RoomPresenceProvider } from "@/components/room/room-presence";
import { TimerNode } from "@/components/room/nodes/TimerNode";
import { usePanelState } from "@/components/room/hooks/usePanelState";
import { useRetroPermissions } from "@/hooks/usePermissions";
import { useStableActions } from "@/hooks/useStableActions";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";
import { runAct } from "@/lib/run-act";
import { copyTextToClipboard } from "@/utils/copy-text-to-clipboard";
import { downloadFile } from "@/utils/download-file";
import { RetroNode } from "./nodes/retro-node";
import { PadNode } from "./nodes/pad-node";
import { StickyNode } from "./nodes/sticky-node";
import { ActionsNode } from "./nodes/actions-node";
import { RetroSettingsPanel } from "./retro-settings-panel";
import { buildRetroEdges, buildRetroNodes, topicOrder } from "./build-retro-nodes";
import { buildRetroSummary } from "./retro-summary";
import { useRetroMutations } from "./use-retro-mutations";
import { isOptimistic } from "./optimistic";
import type { RetroBoardActions, RetroFlowNode, StickyFlowNode } from "./types";

// Outside the component so React Flow sees stable objects: it re-applies
// any prop whose identity changes, on every render.
const nodeTypes: NodeTypes = {
  retro: RetroNode,
  pad: PadNode,
  sticky: StickyNode,
  actions: ActionsNode,
  timer: TimerNode,
};
const PRO_OPTIONS = { hideAttribution: true };
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.8 };
const SNAP_GRID: [number, number] = [10, 10];
const DELETE_KEYS = ["Backspace", "Delete"];
const PAN_BUTTONS = [1, 2];

const FAILED = "That didn't go through. Try again.";

interface RetroCanvasProps {
  roomData: RoomWithRelatedData;
  currentUserId: Id<"users">;
}

type Draft = {
  clientId: string;
  columnId: string;
  position: { x: number; y: number };
};

/**
 * Copies the derived nodes into React Flow's buffer. A node that hasn't
 * changed keeps its object, so React Flow skips it and its memo holds; a
 * changed one keeps what React Flow owns locally (selection, measurements,
 * and its position while it's being dragged).
 */
function mergeNodes(previous: RetroFlowNode[], derived: RetroFlowNode[]): RetroFlowNode[] {
  const byId = new Map(previous.map((n) => [n.id, n]));
  return derived.map((node) => {
    const local = byId.get(node.id);
    if (!local) return node;
    const samePlace = local.dragging || (local.position.x === node.position.x && local.position.y === node.position.y);
    const same =
      samePlace &&
      local.type === node.type &&
      local.draggable === node.draggable &&
      local.zIndex === node.zIndex &&
      isEqual(local.data, node.data);
    if (same) return local;
    return {
      ...node,
      selected: local.selected,
      ...(local.measured ? { measured: local.measured } : {}),
      ...(local.dragging ? { position: local.position, dragging: true } : {}),
    } as RetroFlowNode;
  });
}

function RetroCanvasInner({ roomData, currentUserId }: RetroCanvasProps): ReactElement {
  const router = useRouter();
  const isMobile = useIsMobile();
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
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
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
      const node = sticky && flow.getNode(sticky.clientId);
      if (!node) return;
      void flow.setCenter(
        node.position.x + (node.measured?.width ?? STICKY_WIDTH) / 2,
        node.position.y + (node.measured?.height ?? STICKY_MIN_HEIGHT) / 2,
        // Keep the viewer's zoom unless it's too far out to read a sticky.
        { zoom: Math.max(flow.getZoom(), 0.7), duration: 500 }
      );
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
    renameColumn: (columnId, title) => void runAct(m.updateColumn({ roomId, columnId, title }), FAILED),
    addActionItem: (text) => void runAct(m.addActionItem({ roomId, text }), "That action item didn't save."),
    // A pending item offers nothing to click (see ActionRow), so these only see saved ones.
    updateActionItem: (itemId, patch) => void runAct(m.updateActionItem({ itemId, ...patch }), FAILED),
    deleteActionItem: (itemId) => void runAct(m.deleteActionItem({ itemId }), FAILED),
  });

  /** Which sticky a dragged sticky would stack onto: the one under its centre. */
  const stackTargetFor = (node: RetroFlowNode): StickyFlowNode | undefined => {
    if (node.type !== "sticky" || !node.data.sticky) return undefined;
    const dragged = node.data.sticky;
    const cx = node.position.x + (node.measured?.width ?? STICKY_WIDTH) / 2;
    const cy = node.position.y + (node.measured?.height ?? STICKY_MIN_HEIGHT) / 2;
    return flow
      .getIntersectingNodes(node)
      .filter((n): n is StickyFlowNode => n.type === "sticky" && n.id !== node.id && !!n.data.sticky)
      .find((n) => {
        const target = n.data.sticky!;
        if (isOptimistic(target._id)) return false;
        if (retro.step === "write" && !(dragged.mine && target.mine)) return false;
        const w = n.measured?.width ?? STICKY_WIDTH;
        const h = n.measured?.height ?? STICKY_MIN_HEIGHT;
        return cx >= n.position.x && cx <= n.position.x + w && cy >= n.position.y && cy <= n.position.y + h;
      });
  };

  const [nodes, setNodes, applyNodeChanges] = useNodesState<RetroFlowNode>([]);

  const onNodesChange = (changes: NodeChange<RetroFlowNode>[]) => {
    const kept = changes.filter((change) => {
      if (change.type !== "remove") return true;
      // Delete/Backspace on a selection: only stickies the viewer may remove.
      const node = flow.getNode(change.id);
      if (node?.type === "sticky" && node.data.sticky && node.data.canEdit) {
        actions.deleteSticky(node.data.sticky._id);
      }
      return false;
    });
    applyNodeChanges(kept);
  };

  const onNodeDrag: OnNodeDrag<RetroFlowNode> = (_event, node, dragged) => {
    const target = dragged.length === 1 ? stackTargetFor(node) : undefined;
    setDropTargetId(target?.id ?? null);
  };

  const onNodeDragStop: OnNodeDrag<RetroFlowNode> = (_event, node, dragged) => {
    setDropTargetId(null);
    const target = dragged.length === 1 ? stackTargetFor(node) : undefined;
    if (target && node.type === "sticky" && node.data.sticky) {
      void runAct(
        m.stackSticky({ stickyId: node.data.sticky._id, ontoId: target.data.sticky!._id }),
        "Those didn't stack. Try again."
      );
      return;
    }
    const moves = dragged
      .filter((n): n is StickyFlowNode => n.type === "sticky" && !!n.data.sticky && !isOptimistic(n.data.sticky._id))
      .map((n) => ({ stickyId: n.data.sticky!._id, position: n.position }));
    if (moves.length > 0) void runAct(m.moveStickies({ roomId, moves }), "That move didn't save.");
    for (const n of dragged) {
      if (n.type === "sticky") continue;
      void runAct(
        m.updateNodePosition({ roomId, nodeId: n.id, position: n.position, userId: currentUserId }),
        "That move didn't save."
      );
    }
  };

  // Double-click anywhere on the board: a sticky right there, in the
  // column whose pad is nearest.
  const onPaneClick = (event: MouseEvent) => {
    if (event.detail !== 2) return;
    const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const pads = flow.getNodes().filter((n) => n.type === "pad");
    if (pads.length === 0) return;
    const nearest = pads.reduce((best, pad) =>
      Math.abs(pad.position.x + PAD_WIDTH / 2 - at.x) < Math.abs(best.position.x + PAD_WIDTH / 2 - at.x) ? pad : best
    );
    const columnId = nearest.type === "pad" ? nearest.data.column.id : undefined;
    if (columnId) actions.startDraft(columnId, { x: at.x - STICKY_WIDTH / 2, y: at.y - 24 });
  };

  // The canvas's own handlers, frozen too, so React Flow and the chrome
  // never see a new prop on a re-render.
  const handlers = useStableActions({
    onNodesChange,
    onNodeDrag,
    onNodeDragStop,
    onPaneClick,
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

  const derivedNodes = useMemo(
    () =>
      buildRetroNodes({
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
        dropTargetId,
        actions,
      }),
    [roomId, currentUserId, room.name, retro, perms, board, votesCast, items, canvasNodes, roomData.users, draft, editingId, expandedIds, dropTargetId, actions]
  );
  const edges = useMemo(
    () => buildRetroEdges(retro.columns, !!canvasNodes?.some((n) => n.nodeId === "timer")),
    [retro.columns, canvasNodes]
  );

  useEffect(() => {
    setNodes((previous) => mergeNodes(previous, derivedNodes));
  }, [derivedNodes, setNodes]);

  // While writing, a sticky is face-up only in its author's browser, so that
  // browser records how tall each of its own is drawn, for the reveal to move
  // stickies clear of the ones that turn out taller (ADR-0027). Only a fresh
  // measurement counts: right after an edit or an open stack closes, the one
  // React Flow holds is still the editor's or the stack's.
  const heightsSeen = useRef(new Map<string, number>());
  const heightsSent = useRef(new Map<string, number>());
  useEffect(() => {
    const heights: { stickyId: Id<"retroStickies">; height: number }[] = [];
    for (const node of nodes) {
      if (node.type !== "sticky" || !node.data.sticky?.mine) continue;
      const stickyId = node.data.sticky._id;
      const height = Math.round(node.measured?.height ?? 0);
      if (!height || isOptimistic(stickyId) || heightsSeen.current.get(stickyId) === height) continue;
      heightsSeen.current.set(stickyId, height);
      if (node.data.editing || node.data.expanded || heightsSent.current.get(stickyId) === height) continue;
      heightsSent.current.set(stickyId, height);
      heights.push({ stickyId, height });
    }
    if (heights.length > 0) handlers.measureStickies(heights);
  }, [nodes, handlers]);

  // Fit the board once, when it first has its nodes measured.
  const initialized = useNodesInitialized();
  const fitted = useRef(false);
  useEffect(() => {
    if (!initialized || fitted.current || !board || !canvasNodes) return;
    fitted.current = true;
    void flow.fitView({ padding: 0.12, maxZoom: 1, duration: 0 });
  }, [initialized, board, canvasNodes, flow]);

  // The spotlight: when the discussion moves, everyone's view follows it.
  const focusId = retro.step === "discuss" ? retro.focusStickyId : undefined;
  useEffect(() => {
    if (!focusId || !fitted.current) return;
    actions.panToTopic(focusId);
  }, [focusId, actions]);

  const shareActions = useMemo(
    () => [
      { label: "Copy summary", icon: ClipboardCopy, onSelect: actions.copySummary },
      { label: "Download Markdown", icon: Download, onSelect: handlers.downloadSummary },
    ],
    [actions, handlers]
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-surface-1" data-testid="retro-board" data-step={retro.step}>
      <div className="relative h-full min-w-0 flex-1">
        <CanvasNavigation
          roomData={roomData}
          isSettingsOpen={isSettingsOpen}
          onSettingsPanelChange={handlers.setSettingsOpen}
          shareActions={shareActions}
        />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handlers.onNodesChange}
          onNodeDrag={handlers.onNodeDrag}
          onNodeDragStop={handlers.onNodeDragStop}
          onPaneClick={handlers.onPaneClick}
          proOptions={PRO_OPTIONS}
          minZoom={0.1}
          maxZoom={2.5}
          defaultViewport={DEFAULT_VIEWPORT}
          nodesConnectable={false}
          edgesFocusable={false}
          zoomOnDoubleClick={false}
          snapToGrid
          snapGrid={SNAP_GRID}
          panOnScroll
          selectionOnDrag={!isMobile}
          panOnDrag={isMobile ? true : PAN_BUTTONS}
          preventScrolling={false}
          deleteKeyCode={DELETE_KEYS}
          onlyRenderVisibleElements={false}
        >
          <CanvasDotsBackground />
        </ReactFlow>
        {board && board.stickies.length === 0 && !draft && retro.step === "write" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
            <p className="rounded-full bg-white/95 px-4 py-2 text-sm text-gray-600 shadow-lg ring-1 ring-foreground/10 backdrop-blur-sm dark:bg-surface-1/95 dark:text-gray-300">
              Click a pad to write a sticky (GIFs welcome), or double-click anywhere on the board.
            </p>
          </div>
        )}
      </div>
      <RetroSettingsPanel
        roomData={roomData}
        currentUserId={currentUserId}
        isOpen={isSettingsOpen}
        onClose={closeAll}
        onCopySummary={actions.copySummary}
      />
    </div>
  );
}

/**
 * The retro whiteboard: the poker room's canvas, chrome and node vocabulary,
 * with a retro node, a sticky pad per column, stickies and the action
 * items on it. One presence subscription per viewer, as in the poker room.
 */
export function RetroCanvas(props: RetroCanvasProps): ReactElement {
  return (
    <ReactFlowProvider>
      <RoomPresenceProvider roomId={props.roomData.room._id} userId={props.currentUserId} users={props.roomData.users}>
        <RetroCanvasInner {...props} />
      </RoomPresenceProvider>
    </ReactFlowProvider>
  );
}
