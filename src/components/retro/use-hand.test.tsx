/**
 * The hand (ADR-0022, spec §10.5): the only local canvas state is the
 * override map `{ clientId → position }`, written from React Flow position
 * changes while dragging, read ahead of the query value, and cleared on
 * drop in the same tick the move is issued. Nothing is written on
 * pointer-move; the derived position equals the optimistic value in the
 * same render as the drop. Selection is local too (spec §10.4).
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";
import type { Node } from "@xyflow/react";
import { useHand, type Move } from "./use-hand";
import type { BoardCard } from "./cards";
import type { Id } from "@/convex/_generated/dataModel";

const card = (clientId: string, x = 0, y = 0): BoardCard => ({
  _id: `id-${clientId}` as Id<"retroCards">,
  clientId,
  promptId: "p1",
  position: { x, y },
  hidden: false,
  own: true,
});

const node = (id: string, x: number, y: number): Node => ({ id, position: { x, y }, data: {} });

/**
 * The board as the hook sees it: the cards prop, and a drop handler that
 * applies the optimistic value to the cards synchronously — what
 * `withOptimisticUpdate` does before the request leaves.
 */
function harness(initial: BoardCard[], tapSelect = false) {
  const drops: Move[][] = [];
  return {
    drops,
    hook: renderHook(() => {
      const [cards, setCards] = useState(initial);
      const hand = useHand({
        cards,
        tapSelect,
        onDrop: (moves) => {
          drops.push(moves);
          setCards((prev) =>
            prev.map((c) => {
              const move = moves.find((m) => m.clientId === c.clientId);
              return move ? { ...c, position: move.position } : c;
            })
          );
        },
      });
      return { ...hand, cards };
    }),
  };
}

describe("useHand", () => {
  it("a position change while dragging goes to the override map, never to a write", () => {
    const { drops, hook } = harness([card("a")]);
    act(() => {
      hook.result.current.onNodesChange([{ type: "position", id: "a", position: { x: 5, y: 6 }, dragging: true }]);
    });
    expect(hook.result.current.positions.get("a")).toEqual({ x: 5, y: 6 });
    expect(hook.result.current.cards[0].position).toEqual({ x: 0, y: 0 });
    expect(drops).toEqual([]);
  });

  it("on drop the override clears and the derived position equals the optimistic value in the same render", () => {
    const { drops, hook } = harness([card("a")]);
    act(() => {
      hook.result.current.onNodesChange([{ type: "position", id: "a", position: { x: 5, y: 6 }, dragging: true }]);
    });
    const renders = vi.fn();
    act(() => {
      hook.result.current.onNodeDragStop({} as never, node("a", 9, 9), [node("a", 9, 9)]);
      renders();
    });
    expect(drops).toEqual([[{ clientId: "a", position: { x: 9, y: 9 } }]]);
    expect(hook.result.current.overrides.size).toBe(0);
    expect(hook.result.current.positions.get("a")).toEqual({ x: 9, y: 9 });
  });

  it("a multi-node drop is one batch, and a query update mid-drag never moves the hand", () => {
    const { drops, hook } = harness([card("a"), card("b", 1, 1)]);
    act(() => {
      hook.result.current.onNodesChange([
        { type: "position", id: "a", position: { x: 5, y: 5 }, dragging: true },
        { type: "position", id: "b", position: { x: 6, y: 6 }, dragging: true },
      ]);
    });
    hook.rerender();
    expect(hook.result.current.positions.get("b")).toEqual({ x: 6, y: 6 });
    act(() => {
      hook.result.current.onNodeDragStop({} as never, node("a", 7, 7), [node("a", 7, 7), node("b", 8, 8)]);
    });
    expect(drops).toEqual([
      [
        { clientId: "a", position: { x: 7, y: 7 } },
        { clientId: "b", position: { x: 8, y: 8 } },
      ],
    ]);
  });

  it("keeps what React Flow measured, so a rebuilt node is not hidden", () => {
    const { hook } = harness([card("a")]);
    act(() => {
      hook.result.current.onNodesChange([{ type: "dimensions", id: "a", dimensions: { width: 200, height: 96 } }]);
    });
    expect(hook.result.current.measured.get("a")).toEqual({ width: 200, height: 96 });
  });

  it("selection changes are held locally", () => {
    const { hook } = harness([card("a"), card("b")]);
    act(() => {
      hook.result.current.onNodesChange([
        { type: "select", id: "a", selected: true },
        { type: "select", id: "b", selected: true },
      ]);
    });
    expect([...hook.result.current.selected].sort()).toEqual(["a", "b"]);
    act(() => {
      hook.result.current.onNodesChange([{ type: "select", id: "a", selected: false }]);
    });
    expect([...hook.result.current.selected]).toEqual(["b"]);
  });

  it("tap-select toggles a card per select:true, ignores select:false, and clears on demand", () => {
    const { hook } = harness([card("a"), card("b")], true);
    act(() => {
      hook.result.current.onNodesChange([{ type: "select", id: "a", selected: true }]);
    });
    act(() => {
      // A second tap elsewhere: React Flow would deselect the first; a tap keeps it.
      hook.result.current.onNodesChange([
        { type: "select", id: "a", selected: false },
        { type: "select", id: "b", selected: true },
      ]);
    });
    expect([...hook.result.current.selected].sort()).toEqual(["a", "b"]);
    act(() => {
      hook.result.current.onNodesChange([{ type: "select", id: "a", selected: true }]);
    });
    expect([...hook.result.current.selected]).toEqual(["b"]);
    act(() => {
      hook.result.current.toggleSelected("a");
    });
    expect([...hook.result.current.selected].sort()).toEqual(["a", "b"]);
    act(() => {
      hook.result.current.clearSelection();
    });
    expect(hook.result.current.selected.size).toBe(0);
  });
});
