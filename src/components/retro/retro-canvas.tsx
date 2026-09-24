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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ClipboardCopy, Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { RetroStep } from "@/convex/retroTemplates";
import { nextStickyPosition, PAD_WIDTH, STICKY_MIN_HEIGHT, STICKY_WIDTH } from "@/convex/retroLayout";
import { CanvasDotsBackground } from "@/components/canvas-dots-background";
import { CanvasNavigation } from "@/components/room/canvas-navigation";
import { RoomPresenceProvider } from "@/components/room/room-presence";
import { TimerNode } from "@/components/room/nodes/TimerNode";
import { useRetroPermissions } from "@/hooks/usePermissions";
import { useLatest } from "@/hooks/use-latest";
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
import type { RetroBoardActions, RetroFlowNode, RetroMember, StickyFlowNode } from "./types";

// Outside the component so React Flow sees one stable object.
const nodeTypes: NodeTypes = {
  retro: RetroNode,
  pad: PadNode,
  sticky: StickyNode,
  actions: ActionsNode,
  timer: TimerNode,
};

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

function RetroCanvasInner({ roomData, currentUserId }: RetroCanvasProps): ReactElement {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { room } = roomData;
  const roomId = room._id;
  const retro = room.retro!;
  const perms = useRetroPermissions(roomData, currentUserId);
  const flow = useReactFlow<RetroFlowNode>();

  const board = useQuery(api.retro.board, { roomId });
  const items = useQuery(api.retro.actionItems, { roomId });
  const canvasNodes = useQuery(api.canvas.getCanvasNodes, { roomId });
  const m = useRetroMutations(roomId);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<Id<"retroStickies"> | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const members = useMemo<RetroMember[]>(
    () => roomData.users.map((u) => ({ _id: u._id, name: u.name, ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}) })),
    [roomData.users]
  );

  // The latest state, for the frozen-identity actions below.
  const latest = useLatest({ board, retro, draft, items, members, room });

  // The tab is titled by the retro (the route's metadata can only say "room").
  useEffect(() => {
    const title = `${room.name} | AgileKit`;
    if (document.title !== title) document.title = title;
  });

  /** The retro as Markdown, from what this viewer can see right now. */
  const summary = useCallback((): { markdown: string; slug: string } | null => {
    const { board, retro, items, room } = latest.current;
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
  }, [latest]);

  const copySummary = useCallback(async () => {
    const current = summary();
    if (!current) return;
    if (await copyTextToClipboard(current.markdown)) {
      toast.success("Summary copied", { description: "Paste it into Slack, Confluence or a ticket." });
    } else {
      toast.error("Couldn't copy the summary");
    }
  }, [summary]);

  const downloadSummary = useCallback(() => {
    const current = summary();
    if (current) downloadFile(current.markdown, `${current.slug}.md`, "text/markdown");
  }, [summary]);

  // Everything a node can ask for, frozen: node data never churns on a handler.
  const actions = useMemo<RetroBoardActions>(() => {
    const stickyOf = (id: string) => latest.current.board?.stickies.find((s) => s._id === id);
    return {
      startDraft: (columnId, at) => {
        const pad = flow.getNode(`pad-${columnId}`);
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
        const current = latest.current.draft;
        if (!current || current.clientId !== clientId) return;
        setDraft(null);
        void runAct(
          m.addSticky({ roomId, clientId, columnId: current.columnId, text, position: current.position, ...(gif ? { gif } : {}) }),
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
      setGif: (stickyId, gif) => void runAct(m.updateSticky({ stickyId, gif }), FAILED),
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
      updateActionItem: (itemId, patch) => {
        if (isOptimistic(itemId)) return;
        void runAct(m.updateActionItem({ itemId, ...patch }), FAILED);
      },
      deleteActionItem: (itemId) => {
        if (isOptimistic(itemId)) return;
        void runAct(m.deleteActionItem({ itemId }), FAILED);
      },
    };
    // m's mutations are stable per mount; `latest` is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, flow, router, copySummary, latest]);

  const derivedNodes = useMemo(
    () =>
      buildRetroNodes({
        roomId,
        viewerId: currentUserId,
        name: room.name,
        step: retro.step,
        columns: retro.columns,
        votesPerPerson: retro.votesPerPerson,
        focusStickyId: retro.focusStickyId,
        nextRoomId: retro.nextRoomId,
        board,
        items,
        canvasNodes,
        members,
        draft,
        editingId,
        expandedIds,
        dropTargetId,
        canFlow: perms.stageFlow,
        canManageCards: perms.cardManagement,
        canManageActions: perms.actionManagement,
        canSettings: perms.retroSettings,
        actions,
      }),
    [roomId, currentUserId, room.name, retro, board, items, canvasNodes, members, draft, editingId, expandedIds, dropTargetId, perms, actions]
  );
  const edges = useMemo(
    () => buildRetroEdges(retro.columns, !!canvasNodes?.some((n) => n.nodeId === "timer")),
    [retro.columns, canvasNodes]
  );

  // The node buffer: derived nodes copied in, keeping what React Flow owns
  // locally (selection, measurements, and the position of a node mid-drag).
  const [nodes, setNodes, applyNodeChanges] = useNodesState<RetroFlowNode>([]);
  useEffect(() => {
    setNodes((previous) => {
      const byId = new Map(previous.map((n) => [n.id, n]));
      return derivedNodes.map((node) => {
        const local = byId.get(node.id);
        if (!local) return node;
        return {
          ...node,
          selected: local.selected,
          ...(local.measured ? { measured: local.measured } : {}),
          ...(local.dragging ? { position: local.position, dragging: true } : {}),
        } as RetroFlowNode;
      });
    });
  }, [derivedNodes, setNodes]);

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

  const onNodesChange = useCallback(
    (changes: NodeChange<RetroFlowNode>[]) => {
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
    },
    [applyNodeChanges, flow, actions]
  );

  /** Which sticky a dragged sticky would stack onto: the one under its centre. */
  const stackTargetFor = useCallback(
    (node: RetroFlowNode): StickyFlowNode | undefined => {
      if (node.type !== "sticky" || !node.data.sticky) return undefined;
      const dragged = node.data.sticky;
      const cx = node.position.x + (node.measured?.width ?? STICKY_WIDTH) / 2;
      const cy = node.position.y + (node.measured?.height ?? STICKY_MIN_HEIGHT) / 2;
      const step = latest.current.retro.step;
      return flow
        .getIntersectingNodes(node)
        .filter((n): n is StickyFlowNode => n.type === "sticky" && n.id !== node.id && !!n.data.sticky)
        .find((n) => {
          const target = n.data.sticky!;
          if (isOptimistic(target._id)) return false;
          if (step === "write" && !(dragged.mine && target.mine)) return false;
          const w = n.measured?.width ?? STICKY_WIDTH;
          const h = n.measured?.height ?? STICKY_MIN_HEIGHT;
          return cx >= n.position.x && cx <= n.position.x + w && cy >= n.position.y && cy <= n.position.y + h;
        });
    },
    [flow, latest]
  );

  const onNodeDrag: OnNodeDrag<RetroFlowNode> = useCallback(
    (_event, node, dragged) => {
      const target = dragged.length === 1 ? stackTargetFor(node) : undefined;
      setDropTargetId((current) => (current === (target?.id ?? null) ? current : (target?.id ?? null)));
    },
    [stackTargetFor]
  );

  const onNodeDragStop: OnNodeDrag<RetroFlowNode> = useCallback(
    (_event, node, dragged) => {
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
    },
    // m's mutations are stable per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stackTargetFor, roomId, currentUserId]
  );

  // Double-click anywhere on the board: a sticky right there, in the
  // column whose pad is nearest.
  const onPaneClick = useCallback(
    (event: MouseEvent) => {
      if (event.detail !== 2) return;
      const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const pads = flow.getNodes().filter((n) => n.type === "pad");
      if (pads.length === 0) return;
      const nearest = pads.reduce((best, pad) =>
        Math.abs(pad.position.x + PAD_WIDTH / 2 - at.x) < Math.abs(best.position.x + PAD_WIDTH / 2 - at.x) ? pad : best
      );
      const columnId = nearest.type === "pad" ? nearest.data.column.id : undefined;
      if (columnId) actions.startDraft(columnId, { x: at.x - STICKY_WIDTH / 2, y: at.y - 24 });
    },
    [flow, actions]
  );

  const shareActions = useMemo(
    () => [
      { label: "Copy summary", icon: ClipboardCopy, onSelect: () => void copySummary() },
      { label: "Download Markdown", icon: Download, onSelect: downloadSummary },
    ],
    [copySummary, downloadSummary]
  );


  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-surface-1" data-testid="retro-board" data-step={retro.step}>
      <div className="relative h-full min-w-0 flex-1">
        <CanvasNavigation
          roomData={roomData}
          isSettingsOpen={settingsOpen}
          onSettingsPanelChange={setSettingsOpen}
          shareActions={shareActions}
          linkNoun="Retro"
        />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={onPaneClick}
          proOptions={{ hideAttribution: true }}
          minZoom={0.1}
          maxZoom={2.5}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          nodesConnectable={false}
          edgesFocusable={false}
          zoomOnDoubleClick={false}
          snapToGrid
          snapGrid={[10, 10]}
          panOnScroll
          selectionOnDrag={!isMobile}
          panOnDrag={isMobile ? true : [1, 2]}
          preventScrolling={false}
          deleteKeyCode={["Backspace", "Delete"]}
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
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onCopySummary={() => void copySummary()}
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
