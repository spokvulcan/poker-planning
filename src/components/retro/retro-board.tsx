"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { ReactFlow, ReactFlowProvider, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Doc } from "@/convex/_generated/dataModel";
import { CanvasDotsBackground } from "@/components/canvas-dots-background";
import { currentStageOf } from "@/convex/model/retro";
import { RetroHeader, type RetroTeam } from "./retro-header";
import { PromptZoneNodeView, type PromptZoneNode } from "./prompt-zone-node";
import { layoutZones } from "./zones";

interface RetroBoardProps {
  /** The room shell's name; the board reads nothing else from it. */
  name: string;
  retro: Doc<"retros">;
  /** The Team that keeps the retro (ADR-0008); undefined for a teamless one. */
  team?: RetroTeam;
  /** The header's menu, for attendees. */
  menu?: ReactNode;
  /** A line under the header: the non-attending Team reader's (ADR-0009). */
  banner?: ReactNode;
}

// Outside the component so React Flow sees one stable object.
const nodeTypes: NodeTypes = { zone: PromptZoneNodeView };

/**
 * The retro board shell (ADR-0011, spec §10.1): its own React Flow
 * integration, sharing tokens and shadcn components with the poker room and
 * no canvas code. No translateExtent (no cage), pan on the primary button
 * and trackpad, only visible elements rendered. The prompt soft zones are
 * drawn from the stamped format; cards, clusters and the hand arrive with
 * their tickets.
 */
export function RetroBoard({ name, retro, team, menu, banner }: RetroBoardProps) {
  const currentStage = currentStageOf(retro);

  // The page is titled by the retro's name (spec §18.1). Set here rather than
  // in the route's metadata, which would have to fetch the room server-side
  // on every room load, poker included, to learn the type.
  useEffect(() => {
    document.title = `${name} | AgileKit`;
  }, [name]);

  const nodes = useMemo<PromptZoneNode[]>(
    () =>
      layoutZones(retro.format.prompts).map((zone) => ({
        id: `zone-${zone.promptId}`,
        type: "zone",
        position: { x: zone.x, y: zone.y },
        data: zone,
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      })),
    [retro.format.prompts]
  );

  return (
    <div
      className="flex h-screen w-screen flex-col bg-white dark:bg-surface-1"
      data-testid="retro-board"
      data-stage={currentStage.kind}
    >
      <RetroHeader
        name={name}
        stageKind={currentStage.kind}
        collectUntil={retro.collectUntil}
        team={team}
        menu={menu}
      />
      {banner}
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.1}
            maxZoom={4}
            nodesConnectable={false}
            onlyRenderVisibleElements
            panOnScroll
            panOnDrag={[1, 2]}
            selectionOnDrag
            preventScrolling={false}
          >
            <CanvasDotsBackground />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
