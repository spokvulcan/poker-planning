"use client";

import { useCallback, useMemo, useState } from "react";
import type { Node, NodeChange } from "@xyflow/react";
import type { BoardCard } from "./cards";

export interface Position {
  x: number;
  y: number;
}

export interface Move {
  clientId: string;
  position: Position;
}

export interface Measured {
  width: number;
  height: number;
}

interface UseHandArgs {
  cards: readonly BoardCard[];
  /**
   * The drop: one batch per gesture, issued in the same tick the override
   * clears. The caller applies the optimistic value synchronously
   * (`withOptimisticUpdate`), so the derived position never jumps.
   */
  onDrop: (moves: Move[]) => void;
}

/**
 * The hand (ADR-0022, spec §10.5): the override map is the only local
 * canvas state besides selection. Nodes are derived from the query value
 * with the override read ahead of it; nothing is written on pointer-move,
 * and every drop is one write.
 */
export function useHand({ cards, onDrop }: UseHandArgs) {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Position>>(new Map());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // What React Flow measured per node. Derived nodes are rebuilt from the
  // query value, and a controlled node rebuilt without its measurement is
  // hidden until it is measured again — which never happens on its own.
  const [measured, setMeasured] = useState<ReadonlyMap<string, Measured>>(new Map());

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const moved: [string, Position][] = [];
    const selection: [string, boolean][] = [];
    const sized: [string, Measured][] = [];
    for (const change of changes) {
      if (change.type === "position" && change.dragging && change.position) {
        moved.push([change.id, change.position]);
      } else if (change.type === "select") {
        selection.push([change.id, change.selected]);
      } else if (change.type === "dimensions" && change.dimensions) {
        sized.push([change.id, change.dimensions]);
      }
    }
    if (sized.length > 0) {
      setMeasured((prev) => {
        const next = new Map(prev);
        for (const [id, size] of sized) next.set(id, size);
        return next;
      });
    }
    if (moved.length > 0) {
      setOverrides((prev) => {
        const next = new Map(prev);
        for (const [id, position] of moved) next.set(id, position);
        return next;
      });
    }
    if (selection.length > 0) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const [id, isSelected] of selection) {
          if (isSelected) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    }
  }, []);

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: Node, nodes: Node[]) => {
      const moves = nodes.map((n) => ({ clientId: n.id, position: n.position }));
      setOverrides((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        for (const move of moves) next.delete(move.clientId);
        return next;
      });
      onDrop(moves);
    },
    [onDrop]
  );

  const positions = useMemo(() => {
    const map = new Map<string, Position>();
    for (const card of cards) map.set(card.clientId, overrides.get(card.clientId) ?? card.position);
    return map;
  }, [cards, overrides]);

  return { overrides, selected, measured, positions, onNodesChange, onNodeDragStop };
}
