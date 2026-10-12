/**
 * React Flow, as a whiteboard's tests need it. It draws every node the
 * whiteboard hands it with its node type and data, as React Flow would; it
 * holds the view (where it is, and the size of the pane) and records every
 * move the whiteboard makes of it; and it drives the gestures React Flow
 * reports to the whiteboard: a drop, a drop onto another node, Delete, a
 * double-click on empty board, a selection, an arrow-key nudge. What the
 * whiteboard does with them, and what a board's adapter makes of that, is
 * the code under test.
 *
 * Test-only. A test file replaces `@xyflow/react` with it:
 *
 *   vi.mock("@xyflow/react", async (importOriginal) =>
 *     (await import("@/components/whiteboard/testing/react-flow")).mockReactFlow(await importOriginal<object>()));
 *
 * and calls `resetFlow()` before each test.
 */
import type { ComponentType, ReactNode } from "react";
import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { Node, NodeChange, ReactFlowProps, Viewport, XYPosition } from "@xyflow/react";

type Move = (options?: unknown) => Promise<boolean>;

const viewMove = () => vi.fn<Move>(() => Promise.resolve(true));

/** React Flow as the whiteboard last drew it, and its view. */
export const flow = {
  /** What the whiteboard handed React Flow on its last render. */
  props: {} as ReactFlowProps<Node>,
  /** The nodes React Flow is drawing: the whiteboard's buffer. */
  nodes: [] as Node[],
  /** How many times the whiteboard drew React Flow. */
  renders: 0,
  /** What React Flow says a dragged node overlaps, when a test sets it. */
  intersecting: [] as Node[],
  /** Where the view is, and the size of the pane React Flow measured. */
  viewport: { x: 0, y: 0, zoom: 1 } as Viewport,
  pane: { width: 1000, height: 800 },
  // Every move of the view, as React Flow was asked for it.
  fitView: viewMove(),
  zoomIn: viewMove(),
  zoomOut: viewMove(),
  setCenter: vi.fn<(x: number, y: number, options?: unknown) => Promise<boolean>>(() => Promise.resolve(true)),
  setViewport: vi.fn<(viewport: Viewport, options?: unknown) => Promise<boolean>>(() => Promise.resolve(true)),
};

/** Forgets the last board and its view. */
export function resetFlow(): void {
  flow.props = {};
  flow.nodes = [];
  flow.renders = 0;
  flow.intersecting = [];
  flow.viewport = { x: 0, y: 0, zoom: 1 };
  flow.pane = { width: 1000, height: 800 };
  flow.fitView = viewMove();
  flow.zoomIn = viewMove();
  flow.zoomOut = viewMove();
  flow.setCenter = vi.fn(() => Promise.resolve(true));
  flow.setViewport = vi.fn(() => Promise.resolve(true));
}

// One instance and one store for the board's life, as React Flow's own are.
const instance = {
  getNode: (id: string) => flow.nodes.find((node) => node.id === id),
  getNodes: () => flow.nodes,
  getIntersectingNodes: () => flow.intersecting,
  screenToFlowPosition: ({ x, y }: XYPosition) => ({
    x: (x - flow.viewport.x) / flow.viewport.zoom,
    y: (y - flow.viewport.y) / flow.viewport.zoom,
  }),
  getViewport: () => flow.viewport,
  getZoom: () => flow.viewport.zoom,
  fitView: (options?: unknown) => flow.fitView(options),
  zoomIn: (options?: unknown) => flow.zoomIn(options),
  zoomOut: (options?: unknown) => flow.zoomOut(options),
  setCenter: (x: number, y: number, options?: unknown) => flow.setCenter(x, y, options),
  setViewport: (viewport: Viewport, options?: unknown) => flow.setViewport(viewport, options),
};
const store = {
  getState: () => ({
    nodes: flow.nodes,
    width: flow.pane.width,
    height: flow.pane.height,
    transform: [flow.viewport.x, flow.viewport.y, flow.viewport.zoom],
  }),
};

/** `@xyflow/react` with React Flow replaced by this one; its types, enums and pure helpers are the real module's. */
export function mockReactFlow<M extends object>(actual: M): M {
  return {
    ...actual,
    // Draws each node with its node type and data, as React Flow would.
    ReactFlow: (props: ReactFlowProps<Node>) => {
      flow.props = props;
      flow.nodes = (props.nodes ?? []) as Node[];
      flow.renders += 1;
      return flow.nodes.map((node) => {
        const Type = props.nodeTypes?.[node.type ?? ""] as ComponentType<Record<string, unknown>> | undefined;
        return Type ? (
          <Type
            key={node.id}
            id={node.id}
            type={node.type}
            data={node.data}
            selected={!!node.selected}
            dragging={!!node.dragging}
            zIndex={node.zIndex ?? 0}
            positionAbsoluteX={node.position.x}
            positionAbsoluteY={node.position.y}
          />
        ) : null;
      });
    },
    ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
    Handle: () => null,
    useNodesInitialized: () => true,
    useReactFlow: () => instance,
    useStoreApi: () => store,
    useStore: (selector: (state: ReturnType<typeof store.getState>) => unknown) => selector(store.getState()),
  } as M;
}

const event = {} as never;

/** The node React Flow is drawing with this id. */
export function nodeOf(id: string): Node {
  const found = flow.nodes.find((node) => node.id === id);
  if (!found) throw new Error(`no node ${id} on the board`);
  return found;
}

function sizeOf(node: Node): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? node.initialWidth ?? 0,
    height: node.measured?.height ?? node.height ?? node.initialHeight ?? 0,
  };
}

/** A drag of `dragged` (the first under the pointer) and its drop, as React Flow reports them. */
function dragAndDrop(dragged: Node[], onto?: Node): void {
  const [lead] = dragged;
  act(() => {
    flow.intersecting = onto ? [onto] : [];
    flow.props.onNodeDragStart?.(event, lead, dragged);
    flow.props.onNodeDrag?.(event, lead, dragged);
    flow.props.onNodeDragStop?.(event, lead, dragged);
    flow.intersecting = [];
  });
}

/** Drags these nodes so the first lands at `to`, the rest keeping their distance from it, and drops them. */
export function drop(to: XYPosition, ...ids: string[]): void {
  const nodes = ids.map(nodeOf);
  const dx = to.x - nodes[0].position.x;
  const dy = to.y - nodes[0].position.y;
  dragAndDrop(nodes.map((node) => ({ ...node, position: { x: node.position.x + dx, y: node.position.y + dy } })));
}

/** Drags a node onto another, its middle over the other's, and drops it there. */
export function dropOnto(id: string, targetId: string): void {
  const dragged = nodeOf(id);
  const target = nodeOf(targetId);
  const from = sizeOf(dragged);
  const to = sizeOf(target);
  const position = {
    x: target.position.x + (to.width - from.width) / 2,
    y: target.position.y + (to.height - from.height) / 2,
  };
  dragAndDrop([{ ...dragged, position }], target);
}

/** Delete or Backspace on these nodes, as React Flow reports it. */
export function pressDelete(...ids: string[]): void {
  act(() => flow.props.onNodesChange?.(ids.map((id): NodeChange<Node> => ({ type: "remove", id }))));
}

/** A click on a node, as React Flow reports it: selected. */
export function select(id: string): void {
  act(() => flow.props.onNodesChange?.([{ type: "select", id, selected: true }]));
}

/** Arrow keys moving nodes, as React Flow reports it: settled positions, with no drag. */
export function nudge(...moves: { id: string; to: XYPosition }[]): void {
  act(() =>
    flow.props.onNodesChange?.(
      moves.map(({ id, to }): NodeChange<Node> => ({ type: "position", id, position: to, dragging: false }))
    )
  );
}

/** A double-click on empty board, at a point on the board. */
export function doubleClickPane(at: XYPosition): void {
  const { x, y, zoom } = flow.viewport;
  act(() => flow.props.onPaneClick?.({ detail: 2, clientX: at.x * zoom + x, clientY: at.y * zoom + y } as never));
}
