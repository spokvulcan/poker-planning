"use client";

import {
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  type ReactFlowInstance,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomUserData } from "@/convex/model/memberships";
import { CanvasDotsBackground } from "@/components/canvas-dots-background";
import { RoomPresenceProvider } from "@/components/room/room-presence";
import { useIsMobile } from "@/hooks/use-mobile";
import { useStableActions } from "@/hooks/useStableActions";
import { cn } from "@/lib/utils";
import { dropTargetAt, type Box } from "./drop-target";
import { mergeNodes } from "./merge-nodes";

/**
 * The whiteboard both ceremonies are drawn on (ADR-0026): the poker room and
 * the retro are its two adapters. A board hands it the nodes it derives from
 * the server and says what its gestures mean; the whiteboard owns everything
 * else: React Flow's buffer (a server tick never yanks a dragged node or drops
 * a selection), one write per drop for every node the drop moved, keyboard
 * nudges, Delete on a selection, dropping one node onto another, the first
 * fit and later refits, following a node, and one React Flow configuration.
 */

// Outside the component so React Flow sees stable objects: it re-applies any
// prop whose identity changes, on every render.
const PRO_OPTIONS = { hideAttribution: true };
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.8 };
const SNAP_GRID: [number, number] = [10, 10];
const DELETE_KEYS = ["Backspace", "Delete"];
const PAN_BUTTONS = [1, 2];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;
/** How long after the last arrow-key nudge the nudged nodes are saved. */
const NUDGE_SETTLE_MS = 300;

/** Nodes a drop moved, where they were dropped, and the node a lone one was dropped onto. */
export interface WhiteboardDrop<N extends Node> {
  nodes: N[];
  target?: N;
}

export interface WhiteboardProps<N extends Node> {
  /** The nodes the board derives from the server, freshly each time. */
  nodes: N[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  /** Nothing moves, gets selected or deleted (the demo). */
  readOnly?: boolean;
  /** Saves where nodes went: once per drop, and once arrow-key nudges stop. */
  onDrop?: (drop: WhiteboardDrop<N>) => void;
  /** Whether a lone dragged node can be dropped onto `target`; the target is then highlighted. */
  canDropOn?: (dragged: N, target: N) => boolean;
  /** Delete or Backspace on a selection. The whiteboard never removes a node itself. */
  onDeleteNodes?: (nodes: N[]) => void;
  /** A double-click on empty board, at the board position under the pointer. */
  onPaneDoubleClick?: (at: XYPosition) => void;
  /** The board fits itself once its nodes are measured, and again whenever this changes. */
  fitKey?: string;
  /** Keeps a node in view: the board pans to it whenever this changes. */
  followNodeId?: string;
  /** The room's chrome, over the board. */
  navigation?: ReactNode;
  /** Anything else over the board: toolbars, hints, dialogs. */
  overlay?: ReactNode;
  /** Panels docked beside the board. */
  panels?: ReactNode;
  className?: string;
  testId?: string;
  dataStep?: string;
}

const DropTargetContext = createContext<string | null>(null);

/** Whether a node is where a dragged node would land: for the node to draw itself as a target. */
export function useIsDropTarget(nodeId: string): boolean {
  return useContext(DropTargetContext) === nodeId;
}

/** A node's box, at its measured size or the size it was drawn with. */
export function boxOf(node: Node): Box {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? node.width ?? node.initialWidth ?? 0,
    height: node.measured?.height ?? node.height ?? node.initialHeight ?? 0,
  };
}

/** Pans so a node sits in the middle of the view, keeping the zoom unless it's too far out to read. */
export function centerOn<N extends Node>(flow: ReactFlowInstance<N>, nodeId: string): void {
  const node = flow.getNode(nodeId);
  if (!node) return;
  const box = boxOf(node);
  void flow.setCenter(box.x + box.width / 2, box.y + box.height / 2, {
    zoom: Math.max(flow.getZoom(), 0.7),
    duration: 500,
  });
}

export function Whiteboard<N extends Node>(props: WhiteboardProps<N>): ReactElement {
  const { nodes, edges, nodeTypes, readOnly = false, fitKey = "", followNodeId } = props;
  const flow = useReactFlow<N>();
  const isMobile = useIsMobile();
  const [buffer, setBuffer, applyChanges] = useNodesState<N>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragging = useRef(false);
  const nudged = useRef(new Map<string, XYPosition>());
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBuffer((previous) => mergeNodes(previous, nodes));
  }, [nodes, setBuffer]);

  useEffect(
    () => () => {
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    },
    []
  );

  /** The node under a lone dragged one, when the board takes that drop. */
  const targetFor = (node: N | undefined, dragged: N[]): N | undefined => {
    if (!node || dragged.length !== 1 || !props.canDropOn) return undefined;
    const canDropOn = props.canDropOn;
    const candidates = flow
      .getIntersectingNodes(node)
      .filter((other): other is N => other.id !== node.id && canDropOn(node, other as N))
      .map((other) => ({ node: other, box: boxOf(other) }));
    return dropTargetAt(boxOf(node), candidates)?.node;
  };

  const handlers = useStableActions({
    onNodesChange: (changes: NodeChange<N>[]) => {
      const removed = changes.flatMap((change) => {
        if (change.type !== "remove") return [];
        const node = flow.getNode(change.id);
        return node ? [node] : [];
      });
      if (removed.length > 0) props.onDeleteNodes?.(removed);
      const kept = changes.filter((change) => change.type !== "remove");
      applyChanges(kept);

      // An arrow-key nudge settles without a drag: save the nudged nodes once the keys stop.
      if (dragging.current) return;
      for (const change of kept) {
        if (change.type === "position" && change.position && change.dragging === false) {
          nudged.current.set(change.id, change.position);
        }
      }
      if (nudged.current.size === 0) return;
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      nudgeTimer.current = setTimeout(() => {
        nudgeTimer.current = null;
        const moved = [...nudged.current].flatMap(([id, position]) => {
          const node = flow.getNode(id);
          return node ? [{ ...node, position }] : [];
        });
        nudged.current.clear();
        if (moved.length > 0) props.onDrop?.({ nodes: moved });
      }, NUDGE_SETTLE_MS);
    },
    onNodeDragStart: () => {
      dragging.current = true;
    },
    onNodeDrag: ((_event, node, dragged) => {
      setDropTargetId(targetFor(node, dragged)?.id ?? null);
    }) as OnNodeDrag<N>,
    onNodeDragStop: ((_event, node, dragged) => {
      dragging.current = false;
      setDropTargetId(null);
      if (dragged.length > 0) props.onDrop?.({ nodes: dragged, target: targetFor(node, dragged) });
    }) as OnNodeDrag<N>,
    onPaneClick: (event: MouseEvent) => {
      if (event.detail !== 2 || !props.onPaneDoubleClick) return;
      props.onPaneDoubleClick(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
  });

  // Fit once the nodes are measured, and again when the board says its layout changed.
  const initialized = useNodesInitialized();
  const fittedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!initialized || nodes.length === 0 || fittedKey.current === fitKey) return;
    const first = fittedKey.current === null;
    fittedKey.current = fitKey;
    void flow.fitView({ padding: 0.12, maxZoom: 1, duration: first ? 0 : 600 });
  }, [initialized, fitKey, nodes.length, flow]);

  // Keep the followed node in view, once the board has had its first fit.
  useEffect(() => {
    if (!followNodeId || fittedKey.current === null) return;
    centerOn(flow, followNodeId);
  }, [followNodeId, flow]);

  return (
    <div
      className={cn("flex h-screen w-full overflow-hidden", props.className)}
      data-testid={props.testId}
      data-step={props.dataStep}
    >
      <div className="relative h-full min-w-0 flex-1">
        {props.navigation}
        <DropTargetContext.Provider value={dropTargetId}>
          <ReactFlow
            nodes={buffer}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={readOnly ? undefined : handlers.onNodesChange}
            onNodeDragStart={handlers.onNodeDragStart}
            onNodeDrag={handlers.onNodeDrag}
            onNodeDragStop={handlers.onNodeDragStop}
            onPaneClick={handlers.onPaneClick}
            proOptions={PRO_OPTIONS}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            defaultViewport={DEFAULT_VIEWPORT}
            nodesDraggable={!readOnly}
            elementsSelectable={!readOnly}
            nodesConnectable={false}
            edgesFocusable={false}
            zoomOnDoubleClick={false}
            snapToGrid
            snapGrid={SNAP_GRID}
            panOnScroll
            selectionOnDrag={!isMobile && !readOnly}
            panOnDrag={isMobile ? true : PAN_BUTTONS}
            preventScrolling={false}
            deleteKeyCode={readOnly ? null : DELETE_KEYS}
          >
            <CanvasDotsBackground />
          </ReactFlow>
        </DropTargetContext.Provider>
        {props.overlay}
      </div>
      {props.panels}
    </div>
  );
}

/**
 * What a whiteboard needs around it: React Flow's store, and the room's one
 * presence subscription. Presence wraps the board from out here, so a
 * presence tick re-renders only its consumers (the avatars, the roster),
 * never the board.
 */
export function WhiteboardProviders({
  presence,
  children,
}: {
  presence?: { roomId: Id<"rooms">; userId: Id<"users"> | string; users: RoomUserData[] };
  children: ReactNode;
}): ReactElement {
  return (
    <ReactFlowProvider>
      {presence ? (
        <RoomPresenceProvider roomId={presence.roomId} userId={presence.userId} users={presence.users}>
          {children}
        </RoomPresenceProvider>
      ) : (
        children
      )}
    </ReactFlowProvider>
  );
}
