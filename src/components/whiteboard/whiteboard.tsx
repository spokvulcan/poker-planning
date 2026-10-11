"use client";

import {
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStoreApi,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  type ReactFlowInstance,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
 * nudges, Delete on a selection, dropping one node onto another, the view
 * (the first fit and later refits, following a node, and the fit, zoom,
 * centring and bringing into view that the chrome and the boards ask for
 * through `useWhiteboardView`), and one React Flow configuration. React
 * Flow's viewport is moved nowhere else.
 */

// Outside the component so React Flow sees stable objects: it re-applies any
// prop whose identity changes, on every render.
const PRO_OPTIONS = { hideAttribution: true };
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.8 };
const SNAP_GRID: [number, number] = [10, 10];
const DELETE_KEYS = ["Backspace", "Delete"];
const PAN_BUTTONS = [1, 2];
/** How long after the last arrow-key nudge the nudged nodes are saved. */
const NUDGE_SETTLE_MS = 300;

// The view's one rule, whoever moves it. A fit frames the whole board with
// a margin and never zooms past 100%, so a small board is never blown up, on
// first load or from the chrome's button. Zoom stays between MIN_ZOOM and
// MAX_ZOOM; a node the view centres on is shown at READABLE_ZOOM at least;
// a box brought into view keeps VIEW_MARGIN clear of the pane's edges,
// where the chrome's bars sit. A move the viewer asks for takes
// VIEWER_MOVE_MS; one the board makes by itself (a refit for a new layout,
// following a node) glides for BOARD_MOVE_MS, so nobody watching loses their
// place. All of it is measured against the board's own pane, which a docked
// panel narrows, never the window.
const FIT_VIEW_OPTIONS = { padding: 0.12, maxZoom: 1 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;
const READABLE_ZOOM = 0.7;
const VIEW_MARGIN = 96;
const VIEWER_MOVE_MS = 300;
const BOARD_MOVE_MS = 600;

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
}

/**
 * The node a dragged one would land on, held outside React state: when it
 * changes, only the node it leaves and the node it reaches re-render, not
 * the board and every node on it.
 */
class DropTarget {
  private id: string | null = null;
  private readonly listeners = new Set<() => void>();

  get = (): string | null => this.id;

  set(id: string | null): void {
    if (id === this.id) return;
    this.id = id;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

const DropTargetContext = createContext(new DropTarget());

/** Whether a node is where a dragged node would land: for the node to draw itself as a target. */
export function useIsDropTarget(nodeId: string): boolean {
  const target = useContext(DropTargetContext);
  const isTarget = () => target.get() === nodeId;
  return useSyncExternalStore(target.subscribe, isTarget, isTarget);
}

/** A node's box, at its measured size or the size it was drawn with. */
function boxOf(node: Node): Box {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? node.width ?? node.initialWidth ?? 0,
    height: node.measured?.height ?? node.height ?? node.initialHeight ?? 0,
  };
}

/**
 * What the whiteboard does with the view, for the chrome and the boards drawn
 * on it. Every move keeps the view's one rule (above), so a fit from the
 * chrome frames the board exactly as the board frames itself.
 */
export interface WhiteboardView {
  /** Frames the whole board, never zooming past 100%. */
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Pans a node to the middle of the pane, zooming in to a readable size if the view is further out. */
  centerOn: (nodeId: string) => void;
  /** The smallest pan that shows a box (in board coordinates) whole in the pane, at the zoom the viewer chose. */
  bringIntoView: (box: Box) => void;
}

/** How far to pan for a box to show whole in a pane `width` by `height`, VIEW_MARGIN clear of its edges. */
function panToShow(box: Box, { x, y, zoom }: Viewport, width: number, height: number): { dx: number; dy: number } {
  const left = box.x * zoom + x;
  const top = box.y * zoom + y;
  const right = left + box.width * zoom;
  const bottom = top + box.height * zoom;
  const shift = (start: number, end: number, size: number) =>
    start < VIEW_MARGIN ? VIEW_MARGIN - start : end > size - VIEW_MARGIN ? size - VIEW_MARGIN - end : 0;
  return { dx: shift(left, right, width), dy: shift(top, bottom, height) };
}

/** The view over one board's React Flow, its moves taking `duration`. */
function viewOf<N extends Node>(
  flow: ReactFlowInstance<N>,
  store: ReturnType<typeof useStoreApi>,
  duration: number
): WhiteboardView {
  return {
    fit: () => void flow.fitView({ ...FIT_VIEW_OPTIONS, duration }),
    zoomIn: () => void flow.zoomIn({ duration }),
    zoomOut: () => void flow.zoomOut({ duration }),
    centerOn: (nodeId) => {
      const node = flow.getNode(nodeId);
      if (!node) return;
      const box = boxOf(node);
      void flow.setCenter(box.x + box.width / 2, box.y + box.height / 2, {
        zoom: Math.max(flow.getZoom(), READABLE_ZOOM),
        duration,
      });
    },
    // The pane's size is React Flow's own measure of the board, which a
    // docked panel narrows: the window would put a box under the panel "in view".
    bringIntoView: (box) => {
      const { width, height, transform } = store.getState();
      const [x, y, zoom] = transform;
      const { dx, dy } = panToShow(box, { x, y, zoom }, width, height);
      if (dx !== 0 || dy !== 0) void flow.setViewport({ x: x + dx, y: y + dy, zoom }, { duration });
    },
  };
}

/**
 * The whiteboard's view, for anything drawn inside `WhiteboardProviders`: the
 * chrome's zoom and fit, a board bringing a new sticky into view. Its
 * identity follows React Flow's instance, which changes once, when the
 * viewport is ready.
 */
export function useWhiteboardView(): WhiteboardView {
  const flow = useReactFlow();
  const store = useStoreApi();
  return useMemo(() => viewOf(flow, store, VIEWER_MOVE_MS), [flow, store]);
}

export function Whiteboard<N extends Node>(props: WhiteboardProps<N>): ReactElement {
  const { nodes, edges, nodeTypes, readOnly = false, fitKey = "", followNodeId } = props;
  const flow = useReactFlow<N>();
  const store = useStoreApi();
  // The moves the board makes by itself: refits and following a node.
  const boardView = useMemo(() => viewOf(flow, store, BOARD_MOVE_MS), [flow, store]);
  const isMobile = useIsMobile();
  const [buffer, setBuffer, applyChanges] = useNodesState<N>([]);
  const [dropTarget] = useState(() => new DropTarget());
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

  /** Saves the nodes arrow keys moved, where the keys left them. */
  const saveNudges = () => {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = null;
    const moved = [...nudged.current].flatMap(([id, position]) => {
      const node = flow.getNode(id);
      return node ? [{ ...node, position }] : [];
    });
    nudged.current.clear();
    if (moved.length > 0) props.onDrop?.({ nodes: moved });
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
      nudgeTimer.current = setTimeout(saveNudges, NUDGE_SETTLE_MS);
    },
    // Read-only, the buffer still takes React Flow's measurements, which a
    // changed node carries over (`mergeNodes`): without them React Flow hides
    // it for a frame to measure it again, on every vote.
    onMeasure: (changes: NodeChange<N>[]) => {
      applyChanges(changes.filter((change) => change.type === "dimensions"));
    },
    // A nudge still settling is saved first, so the drop has the last word.
    onNodeDragStart: () => {
      dragging.current = true;
      saveNudges();
    },
    onNodeDrag: ((_event, node, dragged) => {
      dropTarget.set(targetFor(node, dragged)?.id ?? null);
    }) as OnNodeDrag<N>,
    onNodeDragStop: ((_event, node, dragged) => {
      dragging.current = false;
      dropTarget.set(null);
      if (dragged.length > 0) props.onDrop?.({ nodes: dragged, target: targetFor(node, dragged) });
    }) as OnNodeDrag<N>,
    onPaneClick: (event: MouseEvent) => {
      if (event.detail !== 2 || !props.onPaneDoubleClick) return;
      props.onPaneDoubleClick(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
  });

  // The first fit is React Flow's own (the `fitView` prop): it lands in the
  // pass that measures the nodes, before they paint. Fitting from an effect
  // painted them in the top-left corner first, then jumped. Later refits,
  // when the board says its layout changed, are this effect's, and glide.
  const initialized = useNodesInitialized();
  const fittedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!initialized || nodes.length === 0 || fittedKey.current === fitKey) return;
    const first = fittedKey.current === null;
    fittedKey.current = fitKey;
    if (!first) boardView.fit();
  }, [initialized, fitKey, nodes.length, boardView]);

  // Keep the followed node in view, once the board has had its first fit.
  useEffect(() => {
    if (!followNodeId || fittedKey.current === null) return;
    boardView.centerOn(followNodeId);
  }, [followNodeId, boardView]);

  return (
    <div
      className={cn("flex h-screen w-full overflow-hidden", props.className)}
      data-testid={props.testId}
    >
      <div className="relative h-full min-w-0 flex-1">
        {props.navigation}
        <DropTargetContext.Provider value={dropTarget}>
          <ReactFlow
            nodes={buffer}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={readOnly ? handlers.onMeasure : handlers.onNodesChange}
            onNodeDragStart={handlers.onNodeDragStart}
            onNodeDrag={handlers.onNodeDrag}
            onNodeDragStop={handlers.onNodeDragStop}
            onPaneClick={handlers.onPaneClick}
            proOptions={PRO_OPTIONS}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            defaultViewport={DEFAULT_VIEWPORT}
            fitView
            fitViewOptions={FIT_VIEW_OPTIONS}
            nodesDraggable={!readOnly}
            elementsSelectable={!readOnly}
            nodesConnectable={false}
            // An edge joins handles by id, whichever way they point: the poker board joins two source handles.
            connectionMode={ConnectionMode.Loose}
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
