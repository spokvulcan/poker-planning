"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ReactFlow, ReactFlowProvider, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Users } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import type { UserWithPresence } from "@/hooks/useRoomPresence";
import { CanvasDotsBackground } from "@/components/canvas-dots-background";
import { Button } from "@/components/ui/button";
import { ROSTER_TITLE } from "@/convex/retroCopy";
import { currentStageOf } from "@/convex/model/retroFormats";
import { RetroHeader, type RetroTeam } from "./retro-header";
import { PromptZoneNodeView, type PromptZoneNode } from "./prompt-zone-node";
import { layoutZones } from "./zones";
import { StageNav, type StageControls } from "./stage-nav";
import { StageEmptyState } from "./stage-empty-state";
import { RetroRoster } from "./retro-roster";

/** What an attendee brings to the board that a Team reader does not. */
export interface BoardViewer {
  userId: string;
  onSetReady: (ready: boolean) => void;
  controls: StageControls;
}

interface RetroBoardProps {
  /** The room shell's name; the board reads nothing else from it. */
  name: string;
  retro: Doc<"retros">;
  /** The roster's members with presence merged on; a Team reader sees everyone offline. */
  users: readonly UserWithPresence[];
  /** The Team that keeps the retro (ADR-0008); undefined for a teamless one. */
  team?: RetroTeam;
  /** The attendee's presence and stageFlow wiring; absent for a Team reader. */
  viewer?: BoardViewer;
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
 *
 * The root shows the shared stage (`data-stage`); the viewer's own view may
 * sit on another entry (`data-view-stage`) without moving anyone (ADR-0010).
 */
export function RetroBoard({ name, retro, users, team, viewer, menu, banner }: RetroBoardProps) {
  const currentStage = currentStageOf(retro);
  /** The viewer's own view; null follows the shared pointer. */
  const [viewStageId, setViewStageId] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const viewStage = retro.stages.find((stage) => stage.id === viewStageId) ?? currentStage;

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

  const onlineCount = viewer ? users.filter((user) => user.isOnline).length : undefined;

  return (
    <div
      className="flex h-screen w-screen flex-col bg-white dark:bg-surface-1"
      data-testid="retro-board"
      data-stage={currentStage.kind}
      data-view-stage={viewStage.kind}
    >
      <RetroHeader
        name={name}
        stageKind={currentStage.kind}
        timeboxMinutes={currentStage.timeboxMinutes}
        enteredAt={retro.currentStageEnteredAt}
        collectUntil={retro.collectUntil}
        team={team}
        menu={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={ROSTER_TITLE}
              aria-pressed={rosterOpen}
              onClick={() => setRosterOpen((open) => !open)}
            >
              <Users className="size-4" />
              {onlineCount !== undefined ? `${onlineCount}/${users.length}` : users.length}
            </Button>
            {menu}
          </>
        }
      />
      {banner}
      <StageNav
        stages={retro.stages}
        currentStageId={currentStage.id}
        viewStageId={viewStageId}
        onView={setViewStageId}
        controls={viewer?.controls}
      />
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <StageEmptyState kind={viewStage.kind} />
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
        {rosterOpen && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l bg-white p-4 dark:bg-surface-1">
            <RetroRoster
              users={users}
              currentStage={currentStage}
              myUserId={viewer?.userId}
              onSetReady={viewer?.onSetReady}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
