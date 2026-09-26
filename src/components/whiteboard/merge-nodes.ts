import type { Node } from "@xyflow/react";
import { isEqual } from "lodash";

/**
 * Takes a board's freshly derived nodes into React Flow's buffer. A node that
 * hasn't changed keeps its object, so React Flow skips it and the node's memo
 * holds. A changed one keeps what React Flow owns locally: whether it's
 * selected, its measured size, and, while it is being dragged, its place, so
 * a server tick never yanks a node from under the pointer or clears a
 * selection. Pure.
 */
export function mergeNodes<N extends Node>(previous: readonly N[], derived: readonly N[]): N[] {
  const byId = new Map(previous.map((node) => [node.id, node]));
  return derived.map((node) => {
    const local = byId.get(node.id);
    if (!local) return node;
    const samePlace =
      local.dragging || (local.position.x === node.position.x && local.position.y === node.position.y);
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
    };
  });
}
