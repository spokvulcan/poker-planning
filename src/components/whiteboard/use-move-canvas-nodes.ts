"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * The canvas move both boards save their fixed nodes with (the poker room's
 * session, players and notes; the retro's node, pads and action items; either
 * board's timer): every node a drop moved in one write, shown where it was
 * dropped at once, so the next server tick can't pull it back first.
 */
export function useMoveCanvasNodes() {
  return useMutation(api.canvas.moveNodes).withOptimisticUpdate((store, args) => {
    const nodes = store.getQuery(api.canvas.getCanvasNodes, { roomId: args.roomId });
    if (!nodes) return;
    const moved = new Map(args.moves.map((move) => [move.nodeId, move.position]));
    store.setQuery(
      api.canvas.getCanvasNodes,
      { roomId: args.roomId },
      nodes.map((node) => {
        const position = moved.get(node.nodeId);
        return position ? { ...node, position } : node;
      })
    );
  });
}
