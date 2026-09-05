import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import type { Hull } from "./hulls";

// A type alias: React Flow node data must satisfy Record<string, unknown>.
export type HullNodeData = { hull: Hull };
export type HullNode = Node<HullNodeData, "hull">;

/**
 * A proximity hull (spec §10.3, ADR-0011): a dashed outline around cards
 * that sit close together while the shared pointer is in `group`. Inert
 * and identity-free: it is derived from positions on every render, so a
 * member moving away dissolves it, and naming one — forming a cluster from
 * its members — is what promotes it.
 */
export const HullNodeView = memo(function HullNodeView({ data }: NodeProps<HullNode>) {
  const { hull } = data;
  return (
    <div
      data-hull={hull.key}
      data-members={hull.members.length}
      className="rounded-3xl border-2 border-dashed border-ring/40 bg-ring/5"
      style={{ width: hull.width, height: hull.height }}
    />
  );
});
