"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Doc } from "@/convex/_generated/dataModel";
import { RetroHeader } from "./retro-header";
import { PromptZoneNodeView, type PromptZoneNode } from "./prompt-zone-node";
import { layoutZones } from "./zones";

interface RetroBoardProps {
  room: Doc<"rooms">;
  retro: Doc<"retros">;
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
export function RetroBoard({ room, retro }: RetroBoardProps) {
  const currentStage =
    retro.stages.find((stage) => stage.id === retro.currentStageId) ?? retro.stages[0];

  const nodes = useMemo<PromptZoneNode[]>(
    () =>
      layoutZones(retro.format.prompts).map((zone) => ({
        id: `zone-${zone.promptId}`,
        type: "zone",
        position: { x: zone.x, y: zone.y },
        data: {
          promptId: zone.promptId,
          label: zone.label,
          color: zone.color,
          width: zone.width,
          height: zone.height,
        },
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
        name={room.name}
        stageKind={currentStage.kind}
        collectUntil={retro.collectUntil}
      />
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
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              className="*:stroke-gray-300 dark:*:stroke-surface-3"
            />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
