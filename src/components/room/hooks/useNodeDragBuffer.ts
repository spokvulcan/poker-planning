"use client";

import { useNodesState, type Node, type NodeChange } from "@xyflow/react";
import { useCallback, useEffect, useMemo, type RefObject } from "react";
import { debounce } from "lodash";

import { useLatest } from "@/hooks/use-latest";

interface UseNodeDragBufferOptions<N extends Node> {
  /** The derived layout nodes; copied into the buffer whenever they change. */
  layoutNodes: N[];
  /**
   * The single position write path (canvas actions seam). Called once per
   * settled drag — a position change with `dragging === false` — debounced so
   * a flurry of settle events collapses into one write.
   */
  onPositionSettled?: (nodeId: string, position: { x: number; y: number }) => void;
}

interface UseNodeDragBufferReturn<N extends Node> {
  nodes: N[];
  /** Stable mirror of `nodes` — read it in change handlers without re-creating them. */
  nodesRef: RefObject<N[]>;
  /**
   * The React Flow `onNodesChange`: applies the changes locally and fires the
   * debounced write-back for settled drags. Removal filtering stays with the
   * caller — this hook applies everything it is handed.
   */
  onNodesChange: (changes: NodeChange<N>[]) => void;
}

/**
 * The canvas's node buffer between the pure layout derivation and React Flow.
 * Owns the three pieces room-canvas used to inline: the `nodesRef` mirror (so
 * handlers read the latest nodes with a frozen identity), copy-in (derived
 * layout nodes replace the buffer), and the debounced drag write-back. All
 * returned handlers have frozen identity, so consumers' memos never churn.
 */
export function useNodeDragBuffer<N extends Node>({
  layoutNodes,
  onPositionSettled,
}: UseNodeDragBufferOptions<N>): UseNodeDragBufferReturn<N> {
  const [nodes, setNodes, baseOnNodesChange] = useNodesState<N>([]);

  // Stable ref for nodes - prevents callback recreation on layout changes
  // Based on Vercel React Best Practices: advanced-use-latest
  const nodesRef = useLatest(nodes);

  // Copy-in: the derived layout replaces the buffer.
  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  // The debounce lives here, next to the buffer it serves. The write callback
  // is a plain dependency — the actions seam freezes its identity — so this
  // debouncer is created once in practice.
  const debouncedWrite = useMemo(
    () =>
      debounce((nodeId: string, position: { x: number; y: number }) => {
        onPositionSettled?.(nodeId, position);
      }, 100),
    [onPositionSettled],
  );

  // Cancel a pending write on unmount
  useEffect(() => {
    return () => {
      debouncedWrite.cancel();
    };
  }, [debouncedWrite]);

  const onNodesChange = useCallback(
    (changes: NodeChange<N>[]) => {
      baseOnNodesChange(changes);
      for (const change of changes) {
        if (change.type === "position" && change.position && !change.dragging) {
          debouncedWrite(change.id, change.position);
        }
      }
    },
    [baseOnNodesChange, debouncedWrite],
  );

  return { nodes, nodesRef, onNodesChange };
}
