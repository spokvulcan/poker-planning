/**
 * Whiteboard: what the board's gestures do, whichever ceremony is drawn on
 * it. React Flow is the whiteboard's test stand-in (./testing/react-flow):
 * the tests drive the callbacks React Flow would call, the way a drag, a
 * drop, an arrow key or Delete would, and read the view's moves it records.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConnectionMode, type Node, type NodeChange } from "@xyflow/react";

vi.mock("@xyflow/react", async (importOriginal) =>
  (await import("./testing/react-flow")).mockReactFlow(await importOriginal<object>())
);
vi.mock("@/components/canvas-dots-background", () => ({ CanvasDotsBackground: () => null }));

import { flow, resetFlow } from "./testing/react-flow";
import {
  useIsDropTarget,
  useWhiteboardView,
  Whiteboard,
  type WhiteboardProps,
  type WhiteboardView,
} from "./whiteboard";

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

/** A control drawn on the board, as the chrome's and the boards' are, that moves the view once. */
function ViewControl({ move }: { move: (view: WhiteboardView) => void }) {
  const view = useWhiteboardView();
  return <button onClick={() => move(view)}>Move the view</button>;
}

/** Moves the view as the chrome or a board would, from inside the board. */
function moveView(move: (view: WhiteboardView) => void) {
  renderBoard({ overlay: <ViewControl move={move} /> });
  fireEvent.click(screen.getByRole("button", { name: "Move the view" }));
}

beforeEach(() => {
  vi.useFakeTimers();
  resetFlow();
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

describe("the drop target", () => {
  it("re-renders only the node a dragged one reaches, not the board or the other nodes", () => {
    const rendered = vi.fn();
    function Card({ id }: { id: string }) {
      const isTarget = useIsDropTarget(id);
      rendered(id);
      return <div data-testid={id} data-target={isTarget} />;
    }
    renderBoard({ nodeTypes: { card: Card }, nodes: [node("a"), node("b", 200), node("c", 400)], canDropOn: () => true });
    const [a, b] = flow.nodes;
    const boardRenders = flow.renders;
    rendered.mockClear();
    flow.intersecting = [{ ...b, position: { x: 0, y: 0 } }];

    act(() => flow.props.onNodeDrag?.(event, a, [a]));

    expect(screen.getByTestId("b").dataset.target).toBe("true");
    expect(flow.renders).toBe(boardRenders);
    expect(rendered.mock.calls).toEqual([["b"]]);
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

  it("are saved as a drag starts, so the drop that follows has the last word", () => {
    const onDrop = vi.fn();
    renderBoard({ onDrop });
    const [a] = flow.nodes;
    const dropped = { ...a, position: { x: 400, y: 0 } };

    act(() => {
      flow.props.onNodesChange?.([{ type: "position", id: "a", position: { x: 10, y: 0 }, dragging: false }]);
      flow.props.onNodeDragStart?.(event, a, [a]);
      flow.props.onNodeDragStop?.(event, dropped, [dropped]);
      vi.advanceTimersByTime(1000);
    });

    expect(onDrop.mock.calls.map(([drop]) => drop.nodes.map((n: Node) => n.position.x))).toEqual([[10], [400]]);
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
  it("leaves the first fit to React Flow, so the nodes never paint unfitted", () => {
    renderBoard({ fitKey: "one" });

    expect(flow.props.fitView).toBe(true);
    expect(flow.fitView).not.toHaveBeenCalled();
  });

  it("refits only when the board's layout key changes", () => {
    const { rerender } = renderBoard({ fitKey: "one" });

    rerender({ fitKey: "one", nodes: [node("a", 5), node("b", 200)] });
    expect(flow.fitView).not.toHaveBeenCalled();

    rerender({ fitKey: "two" });
    expect(flow.fitView).toHaveBeenCalledTimes(1);
  });

  it("follows a node: pans to it whenever it changes", () => {
    const { rerender } = renderBoard();

    rerender({ followNodeId: "b" });

    expect(flow.setCenter).toHaveBeenCalledWith(250, 50, expect.anything());
  });

  it("fits for the chrome exactly as it fits itself: never past 100%, however small the board", () => {
    moveView((view) => view.fit());

    expect(flow.props.fitViewOptions).toMatchObject({ maxZoom: 1 });
    expect(flow.fitView).toHaveBeenCalledWith(expect.objectContaining(flow.props.fitViewOptions));
  });

  it("zooms a step at a time, within the board's limits", () => {
    moveView((view) => {
      view.zoomIn();
      view.zoomOut();
    });

    expect(flow.zoomIn).toHaveBeenCalledTimes(1);
    expect(flow.zoomOut).toHaveBeenCalledTimes(1);
    expect(flow.props).toMatchObject({ minZoom: 0.1, maxZoom: 2.5 });
  });

  it("centres a node at a readable zoom when the view is further out", () => {
    flow.viewport = { x: 0, y: 0, zoom: 0.3 };

    moveView((view) => view.centerOn("a"));

    expect(flow.setCenter).toHaveBeenCalledWith(50, 50, expect.objectContaining({ zoom: 0.7 }));
  });

  it("brings a box into view within its own pane, which a docked panel narrows, not the window", () => {
    // A panel is docked beside the board: the pane is 600px of the window.
    flow.pane = { width: 600, height: 800 };
    // A sticky past the pane's right edge, though well inside the window.
    const sticky = { x: 500, y: 200, width: 220, height: 200 };
    expect(sticky.x + sticky.width).toBeLessThan(window.innerWidth - 96);

    moveView((view) => view.bringIntoView(sticky));

    // The smallest pan that shows it whole, 96px clear of the edge, at the same zoom.
    expect(flow.setViewport).toHaveBeenCalledWith({ x: 600 - 96 - 720, y: 0, zoom: 1 }, expect.anything());
  });

  it("leaves the view alone for a box already in the pane", () => {
    moveView((view) => view.bringIntoView({ x: 200, y: 200, width: 220, height: 200 }));

    expect(flow.setViewport).not.toHaveBeenCalled();
  });

  it("turns a double-click on empty board into a board position", () => {
    flow.viewport = { x: 0, y: 0, zoom: 0.5 };
    const onPaneDoubleClick = vi.fn();
    renderBoard({ onPaneDoubleClick });

    act(() => flow.props.onPaneClick?.({ detail: 2, clientX: 10, clientY: 20 } as never));
    act(() => flow.props.onPaneClick?.({ detail: 1, clientX: 10, clientY: 20 } as never));

    expect(onPaneDoubleClick.mock.calls).toEqual([[{ x: 20, y: 40 }]]);
  });

  it("draws an edge between any two handles it names, whichever way they point", () => {
    renderBoard();

    expect(flow.props.connectionMode).toBe(ConnectionMode.Loose);
  });

  it("lets nothing move, get selected or deleted when read-only", () => {
    renderBoard({ readOnly: true });

    expect(flow.props).toMatchObject({ nodesDraggable: false, elementsSelectable: false, deleteKeyCode: null });
  });

  it("takes only React Flow's measurements when read-only", () => {
    const onDrop = vi.fn();
    const onDeleteNodes = vi.fn();
    renderBoard({ readOnly: true, onDrop, onDeleteNodes });

    act(() => {
      flow.props.onNodesChange?.([
        { type: "dimensions", id: "a", dimensions: { width: 300, height: 80 } },
        { type: "position", id: "b", position: { x: 999, y: 0 }, dragging: false },
        { type: "remove", id: "b" },
      ]);
      vi.advanceTimersByTime(1000);
    });

    expect(flow.nodes.map((n) => [n.id, n.measured, n.position.x])).toEqual([
      ["a", { width: 300, height: 80 }, 0],
      ["b", { width: 100, height: 100 }, 200],
    ]);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onDeleteNodes).not.toHaveBeenCalled();
  });
});
