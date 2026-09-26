/**
 * Whiteboard: what the board's gestures do, whichever ceremony is drawn on
 * it. React Flow itself is stubbed: the tests drive the callbacks it would
 * call, the way a drag, a drop, an arrow key or Delete would.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { Node, NodeChange, ReactFlowProps } from "@xyflow/react";

const flow = vi.hoisted(() => ({
  props: {} as ReactFlowProps<Node>,
  nodes: [] as Node[],
  intersecting: [] as Node[],
  fitView: (() => Promise.resolve(true)) as (options?: unknown) => Promise<boolean>,
  setCenter: (() => Promise.resolve(true)) as (x: number, y: number, options?: unknown) => Promise<boolean>,
}));

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    ReactFlow: (props: ReactFlowProps<Node>) => {
      flow.props = props;
      flow.nodes = (props.nodes ?? []) as Node[];
      return null;
    },
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
    useNodesInitialized: () => true,
    useReactFlow: () => ({
      getNode: (id: string) => flow.nodes.find((n) => n.id === id),
      getIntersectingNodes: () => flow.intersecting,
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x: x * 2, y: y * 2 }),
      fitView: (options?: unknown) => flow.fitView(options),
      setCenter: (x: number, y: number, options?: unknown) => flow.setCenter(x, y, options),
      getZoom: () => 1,
    }),
  };
});

vi.mock("@/components/canvas-dots-background", () => ({ CanvasDotsBackground: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { Whiteboard, type WhiteboardProps } from "./whiteboard";

const node = (id: string, x = 0): Node => ({
  id,
  type: "card",
  position: { x, y: 0 },
  data: {},
  measured: { width: 100, height: 100 },
});

function renderBoard(props: Partial<WhiteboardProps<Node>> = {}) {
  const all: WhiteboardProps<Node> = { nodes: [node("a"), node("b", 200)], edges: [], nodeTypes: {}, ...props };
  const view = render(<Whiteboard {...all} />);
  return { rerender: (next: Partial<WhiteboardProps<Node>>) => view.rerender(<Whiteboard {...all} {...next} />) };
}

const event = {} as never;

beforeEach(() => {
  vi.useFakeTimers();
  flow.intersecting = [];
  flow.fitView = vi.fn(() => Promise.resolve(true));
  flow.setCenter = vi.fn(() => Promise.resolve(true));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a drop", () => {
  it("saves every node a drop moved, in one call", () => {
    const onDrop = vi.fn();
    renderBoard({ onDrop });
    const [a, b] = flow.nodes;

    act(() => {
      flow.props.onNodeDragStart?.(event, a, [a, b]);
      flow.props.onNodeDragStop?.(event, a, [a, b]);
    });

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0][0]).toEqual({ nodes: [a, b], target: undefined });
  });

  it("names the node a lone dragged one lands on, when the board takes that drop", () => {
    const onDrop = vi.fn();
    renderBoard({ onDrop, canDropOn: () => true });
    const [a, b] = flow.nodes;
    flow.intersecting = [{ ...b, position: { x: 0, y: 0 } }];

    act(() => flow.props.onNodeDragStop?.(event, a, [a]));

    expect(onDrop.mock.calls[0][0].target?.id).toBe("b");
  });

  it("takes no target the board refuses", () => {
    const onDrop = vi.fn();
    renderBoard({ onDrop, canDropOn: () => false });
    const [a, b] = flow.nodes;
    flow.intersecting = [b];

    act(() => flow.props.onNodeDragStop?.(event, a, [a]));

    expect(onDrop.mock.calls[0][0].target).toBeUndefined();
  });

  it("doesn't save the drop's own settled positions a second time", () => {
    const onDrop = vi.fn();
    renderBoard({ onDrop });
    const [a] = flow.nodes;

    act(() => {
      flow.props.onNodeDragStart?.(event, a, [a]);
      flow.props.onNodesChange?.([{ type: "position", id: "a", position: { x: 5, y: 5 }, dragging: false }]);
      flow.props.onNodeDragStop?.(event, a, [a]);
      vi.advanceTimersByTime(1000);
    });

    expect(onDrop).toHaveBeenCalledTimes(1);
  });
});

describe("arrow-key nudges", () => {
  it("are saved together once the keys stop", () => {
    const onDrop = vi.fn();
    renderBoard({ onDrop });
    const nudge = (changes: NodeChange<Node>[]) => act(() => flow.props.onNodesChange?.(changes));

    nudge([{ type: "position", id: "a", position: { x: 10, y: 0 }, dragging: false }]);
    nudge([{ type: "position", id: "b", position: { x: 210, y: 0 }, dragging: false }]);
    act(() => vi.advanceTimersByTime(299));
    expect(onDrop).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0][0].nodes.map((n: Node) => [n.id, n.position.x])).toEqual([
      ["a", 10],
      ["b", 210],
    ]);
  });
});

describe("Delete", () => {
  it("hands the selected nodes to the board and removes nothing itself", () => {
    const onDeleteNodes = vi.fn();
    renderBoard({ onDeleteNodes });

    act(() => flow.props.onNodesChange?.([{ type: "remove", id: "a" }]));

    expect(onDeleteNodes.mock.calls[0][0].map((n: Node) => n.id)).toEqual(["a"]);
    expect(flow.nodes.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("the view", () => {
  it("fits once, and again only when the board's layout key changes", () => {
    const { rerender } = renderBoard({ fitKey: "one" });
    expect(flow.fitView).toHaveBeenCalledTimes(1);

    rerender({ fitKey: "one", nodes: [node("a", 5), node("b", 200)] });
    expect(flow.fitView).toHaveBeenCalledTimes(1);

    rerender({ fitKey: "two" });
    expect(flow.fitView).toHaveBeenCalledTimes(2);
  });

  it("follows a node: pans to it whenever it changes", () => {
    const { rerender } = renderBoard();

    rerender({ followNodeId: "b" });

    expect(flow.setCenter).toHaveBeenCalledWith(250, 50, expect.anything());
  });

  it("turns a double-click on empty board into a board position", () => {
    const onPaneDoubleClick = vi.fn();
    renderBoard({ onPaneDoubleClick });

    act(() => flow.props.onPaneClick?.({ detail: 2, clientX: 10, clientY: 20 } as never));
    act(() => flow.props.onPaneClick?.({ detail: 1, clientX: 10, clientY: 20 } as never));

    expect(onPaneDoubleClick.mock.calls).toEqual([[{ x: 20, y: 40 }]]);
  });

  it("lets nothing move, get selected or deleted when read-only", () => {
    renderBoard({ readOnly: true });

    expect(flow.props).toMatchObject({ nodesDraggable: false, elementsSelectable: false, deleteKeyCode: null });
    expect(flow.props.onNodesChange).toBeUndefined();
  });
});
