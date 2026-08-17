/**
 * useNodeDragBuffer — the canvas node buffer between the layout derivation and
 * React Flow: copy-in replaces the buffer, nodesRef mirrors it, and a settled
 * drag (position change with `dragging === false`) fires the debounced
 * write-back exactly once. Driven through the hook's public surface with
 * renderHook; lodash's debounce is tamed with fake timers.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Node, NodeChange } from "@xyflow/react";
import { useNodeDragBuffer } from "./useNodeDragBuffer";

type TestNode = Node<{ label: string }, "test">;

function testNode(id: string, x = 0, y = 0): TestNode {
  return { id, type: "test", position: { x, y }, data: { label: id } };
}

function settledDrag(id: string, x: number, y: number): NodeChange<TestNode> {
  return { type: "position", id, position: { x, y }, dragging: false };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useNodeDragBuffer — copy-in and the ref mirror", () => {
  it("mirrors the layout nodes into the buffer and keeps nodesRef current", () => {
    const first = [testNode("a"), testNode("b", 25, 25)];
    const { result, rerender } = renderHook(
      ({ layoutNodes }) => useNodeDragBuffer({ layoutNodes }),
      { initialProps: { layoutNodes: first } },
    );

    // Copy-in runs as an effect: the buffer starts empty, then mirrors layout.
    expect(result.current.nodes).toEqual(first);
    expect(result.current.nodesRef.current).toEqual(first);

    const second = [testNode("b", 50, 50), testNode("c")];
    rerender({ layoutNodes: second });
    expect(result.current.nodes).toEqual(second);
    expect(result.current.nodesRef.current).toEqual(second);
  });
});

describe("useNodeDragBuffer — drag write-back", () => {
  // Hoisted layout fixtures: the copy-in effect depends on the layoutNodes
  // reference, so an inline array literal would re-run it every render.
  it("writes back a settled drag once, debounced, with the settled position", () => {
    vi.useFakeTimers();
    const onPositionSettled = vi.fn();
    const layoutNodes = [testNode("a")];
    const { result } = renderHook(() =>
      useNodeDragBuffer({ layoutNodes, onPositionSettled }),
    );

    act(() => {
      result.current.onNodesChange([settledDrag("a", 100, 200)]);
    });
    // Debounced: nothing fires synchronously…
    expect(onPositionSettled).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onPositionSettled).toHaveBeenCalledTimes(1);
    expect(onPositionSettled).toHaveBeenCalledWith("a", { x: 100, y: 200 });
  });

  it("ignores mid-drag positions and position changes without a position", () => {
    vi.useFakeTimers();
    const onPositionSettled = vi.fn();
    const layoutNodes = [testNode("a")];
    const { result } = renderHook(() =>
      useNodeDragBuffer({ layoutNodes, onPositionSettled }),
    );

    act(() => {
      result.current.onNodesChange([
        { type: "position", id: "a", position: { x: 10, y: 10 }, dragging: true },
        { type: "position", id: "a", dragging: false },
      ]);
      vi.advanceTimersByTime(500);
    });

    expect(onPositionSettled).not.toHaveBeenCalled();
  });

  it("collapses a flurry of settles into one write with the latest position", () => {
    vi.useFakeTimers();
    const onPositionSettled = vi.fn();
    const layoutNodes = [testNode("a")];
    const { result } = renderHook(() =>
      useNodeDragBuffer({ layoutNodes, onPositionSettled }),
    );

    act(() => {
      result.current.onNodesChange([settledDrag("a", 10, 10)]);
      vi.advanceTimersByTime(50);
      result.current.onNodesChange([settledDrag("a", 99, 99)]);
      vi.advanceTimersByTime(100);
    });

    expect(onPositionSettled).toHaveBeenCalledTimes(1);
    expect(onPositionSettled).toHaveBeenCalledWith("a", { x: 99, y: 99 });
  });

  it("cancels a pending write on unmount", () => {
    vi.useFakeTimers();
    const onPositionSettled = vi.fn();
    const layoutNodes = [testNode("a")];
    const { result, unmount } = renderHook(() =>
      useNodeDragBuffer({ layoutNodes, onPositionSettled }),
    );

    act(() => {
      result.current.onNodesChange([settledDrag("a", 100, 200)]);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onPositionSettled).not.toHaveBeenCalled();
  });
});

describe("useNodeDragBuffer — change passthrough", () => {
  it("applies every change to local state, removals included (filtering stays with the caller)", () => {
    const layoutNodes = [testNode("a"), testNode("b")];
    const { result } = renderHook(() => useNodeDragBuffer({ layoutNodes }));

    act(() => {
      result.current.onNodesChange([{ type: "remove", id: "a" }]);
    });

    expect(result.current.nodes.map((n) => n.id)).toEqual(["b"]);
    expect(result.current.nodesRef.current.map((n) => n.id)).toEqual(["b"]);
  });
});
