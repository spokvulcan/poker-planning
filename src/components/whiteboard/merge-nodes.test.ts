import { describe, it, expect } from "vitest";
import type { Node } from "@xyflow/react";
import { mergeNodes } from "./merge-nodes";

// A server tick never yanks a node from under the pointer or drops a
// selection, and an unchanged node keeps its object so its memo holds.

const node = (id: string, x: number, data: Record<string, unknown> = {}): Node => ({
  id,
  type: "card",
  position: { x, y: 0 },
  data,
});

describe("mergeNodes", () => {
  it("keeps an unchanged node's object", () => {
    const local = { ...node("a", 0, { n: 1 }), selected: true, measured: { width: 10, height: 10 } };
    const [merged] = mergeNodes([local], [node("a", 0, { n: 1 })]);

    expect(merged).toBe(local);
  });

  it("takes in a changed node, keeping its selection and measured size", () => {
    const local = { ...node("a", 0, { n: 1 }), selected: true, measured: { width: 10, height: 10 } };
    const [merged] = mergeNodes([local], [node("a", 0, { n: 2 })]);

    expect(merged).toMatchObject({ data: { n: 2 }, selected: true, measured: { width: 10, height: 10 } });
  });

  it("keeps a node where the pointer has it while it is being dragged", () => {
    const local = { ...node("a", 300), dragging: true };
    const [merged] = mergeNodes([local], [node("a", 0, { n: 2 })]);

    expect(merged).toMatchObject({ position: { x: 300, y: 0 }, dragging: true, data: { n: 2 } });
  });

  it("moves a node the server moved, once nobody is dragging it", () => {
    const [merged] = mergeNodes([node("a", 0)], [node("a", 50)]);

    expect(merged.position).toEqual({ x: 50, y: 0 });
  });

  it("adds new nodes and drops gone ones, in the derived order", () => {
    expect(mergeNodes([node("a", 0), node("b", 0)], [node("c", 0), node("a", 0)]).map((n) => n.id)).toEqual(["c", "a"]);
  });
});
