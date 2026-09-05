"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ReactFlow, ReactFlowProvider, type Node, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Users } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { ResolvedDecision } from "@/convex/permissions";
import type { UserWithPresence } from "@/hooks/useRoomPresence";
import { CanvasDotsBackground } from "@/components/canvas-dots-background";
import { Button } from "@/components/ui/button";
import { ADD_CARD, FORMER_MEMBER, ROSTER_TITLE } from "@/convex/retroCopy";
import { currentStageOf } from "@/convex/model/retroFormats";
import { RetroHeader, type RetroTeam } from "./retro-header";
import { PromptZoneNodeView, type PromptZoneNode } from "./prompt-zone-node";
import { layoutZones } from "./zones";
import { StageNav, type StageControls } from "./stage-nav";
import { StageEmptyState, isStageEmpty } from "./stage-empty-state";
import { RetroRoster } from "./retro-roster";
import { CardNodeView, type CardNode } from "./card-node";
import { ClusterNodeView, type ClusterNode, type ClusterChipActions } from "./cluster-node";
import { SelectionBar } from "./selection-bar";
import { clusterChips, tidyPositions } from "./clusters";
import type { ClusterActions } from "./use-cluster-actions";
import { CardComposer } from "./card-composer";
import { CARD_MIN_HEIGHT, CARD_WIDTH, placeNewCard, type BoardCard } from "./cards";
import { useHand } from "./use-hand";
import { editingOf } from "./readiness";
import type { CardActions } from "./use-card-actions";

/** What an attendee brings to the board that a Team reader does not. */
export interface BoardViewer {
  userId: string;
  /** The viewer's display name, for the composer's attribution line. */
  name: string;
  onSetReady: (ready: boolean) => void;
  /** The editing indicator: one presence write per state change (ADR-0022). */
  onEditing: (clientId: string | undefined) => void;
  controls: StageControls;
  cards: CardActions;
  clusters: ClusterActions;
  /** Another person's card, and a cluster's rename, merge, tidy and dissolve, only under this decision (spec §4.2). */
  cardManagement: ResolvedDecision;
}

interface RetroBoardProps {
  /** The room shell's name; the board reads nothing else from it. */
  name: string;
  retro: Doc<"retros">;
  /** Every card after the board and mine merge (spec §9). */
  cards: readonly BoardCard[];
  /** Every cluster row: a name and nothing else (ADR-0016). */
  clusters: readonly Pick<Doc<"retroClusters">, "_id" | "name">[];
  /** Who has written, in a named retro (ADR-0012); empty under `anonymous`. */
  writers: readonly string[];
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
const nodeTypes: NodeTypes = { zone: PromptZoneNodeView, card: CardNodeView, cluster: ClusterNodeView };

/** React Flow elevates a selected node to 1000; a chip stays above its members either way. */
const CHIP_Z_INDEX = 1001;

/** The card size the chip centroid and tidy assume; never stored (spec §10.2). */
const CARD_SIZE = { width: CARD_WIDTH, height: CARD_MIN_HEIGHT };

const noMoves = () => {};

/**
 * The retro board (ADR-0011, ADR-0022, spec §10): its own React Flow
 * integration, sharing tokens and shadcn components with the poker room and
 * no canvas code. No translateExtent (no cage), pan on the primary button
 * and trackpad, marquee selection, only visible elements rendered. Nodes
 * are derived by memo from the query values; the only local canvas state
 * is the hand (the override map) and the selection.
 *
 * The root shows the shared stage (`data-stage`); the viewer's own view may
 * sit on another entry (`data-view-stage`) without moving anyone
 * (ADR-0010). `data-zoom-level` is fixed to `detail` until the zoom PR.
 *
 * Clusters are identities (spec §10.3): the chip at the members' centroid
 * is derived here from the cluster rows and the cards' derived positions,
 * so it follows a drag without a write. The selection bar turns a
 * selection into a cluster; tidy computes the grid here and issues the
 * one move batch.
 */
export function RetroBoard({
  name,
  retro,
  cards,
  clusters,
  writers,
  users,
  team,
  viewer,
  menu,
  banner,
}: RetroBoardProps) {
  const currentStage = currentStageOf(retro);
  /** The viewer's own view; null follows the shared pointer. */
  const [viewStageId, setViewStageId] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const viewStage = retro.stages.find((stage) => stage.id === viewStageId) ?? currentStage;

  // The page is titled by the retro's name (spec §18.1). Set here rather than
  // in the route's metadata, which would have to fetch the room server-side
  // on every room load, poker included, to learn the type.
  useEffect(() => {
    document.title = `${name} | AgileKit`;
  }, [name]);

  const zones = useMemo(() => layoutZones(retro.format.prompts), [retro.format.prompts]);

  const zoneNodes = useMemo<PromptZoneNode[]>(
    () =>
      zones.map((zone) => ({
        id: `zone-${zone.promptId}`,
        type: "zone",
        position: { x: zone.x, y: zone.y },
        data: zone,
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      })),
    [zones]
  );

  const hand = useHand({ cards, onDrop: viewer?.cards.move ?? noMoves });

  const namesById = useMemo(() => new Map(users.map((user) => [user._id as string, user.name])), [users]);
  const tintByPrompt = useMemo(
    () => new Map(retro.format.prompts.map((prompt) => [prompt.id, prompt.color])),
    [retro.format.prompts]
  );
  /** Who else is typing into which card, from the presence payloads. */
  const editingBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users) {
      const clientId = editingOf(user.data);
      if (clientId && user._id !== viewer?.userId) map.set(clientId, user.name);
    }
    return map;
  }, [users, viewer?.userId]);

  const named = retro.attribution === "named";
  const cardNodes = useMemo<CardNode[]>(
    () =>
      cards.map((card) => {
        const editable = viewer !== undefined && (card.own || viewer.cardManagement.allowed);
        return {
          id: card.clientId,
          type: "card",
          position: hand.positions.get(card.clientId) ?? card.position,
          ...(hand.measured.has(card.clientId) ? { measured: hand.measured.get(card.clientId) } : {}),
          selected: hand.selected.has(card.clientId),
          draggable: editable,
          data: {
            card,
            color: tintByPrompt.get(card.promptId) ?? "",
            ...(named && card.authorId !== undefined
              ? { authorName: namesById.get(card.authorId) ?? FORMER_MEMBER }
              : {}),
            ...(editingBy.has(card.clientId) ? { editingBy: editingBy.get(card.clientId) } : {}),
            editable,
            ...(viewer && editable
              ? { onEditText: viewer.cards.editText, onDelete: viewer.cards.remove, onEditing: viewer.onEditing }
              : {}),
          },
        };
      }),
    [cards, viewer, hand.positions, hand.measured, hand.selected, tintByPrompt, named, namesById, editingBy]
  );

  const chips = useMemo(
    () =>
      clusterChips(
        clusters,
        cards.map((card) => ({
          clientId: card.clientId,
          position: hand.positions.get(card.clientId) ?? card.position,
          ...(card.clusterId !== undefined ? { clusterId: card.clusterId } : {}),
        })),
        CARD_SIZE
      ),
    [clusters, cards, hand.positions]
  );

  const clusterActions = viewer?.clusters;
  const moveCards = viewer?.cards.move;
  const chipActions = useMemo<ClusterChipActions | undefined>(() => {
    if (!clusterActions || !moveCards) return undefined;
    return {
      rename: (clusterId, name) => clusterActions.rename(clusterId as Id<"retroClusters">, name),
      merge: (from, into) => clusterActions.merge(from as Id<"retroClusters">, into as Id<"retroClusters">),
      dissolve: (clusterId) => clusterActions.dissolve(clusterId as Id<"retroClusters">),
      tidy: (clusterId) => {
        const members = cards
          .filter((card) => card.clusterId === clusterId)
          .map((card) => ({ clientId: card.clientId, position: hand.positions.get(card.clientId) ?? card.position }));
        moveCards(tidyPositions(members, CARD_SIZE));
      },
    };
  }, [clusterActions, moveCards, cards, hand.positions]);

  const clusterNodes = useMemo<ClusterNode[]>(
    () =>
      chips.map((chip) => ({
        id: `cluster-${chip.clusterId}`,
        type: "cluster",
        position: chip.position,
        draggable: false,
        selectable: false,
        focusable: false,
        // Above a selected card, which React Flow elevates to 1000.
        zIndex: CHIP_Z_INDEX,
        data: {
          chip,
          others: chips.filter((other) => other.clusterId !== chip.clusterId),
          ...(viewer && chipActions ? { decision: viewer.cardManagement, actions: chipActions } : {}),
        },
      })),
    [chips, viewer, chipActions]
  );

  const nodes = useMemo<Node[]>(
    () => [...zoneNodes, ...cardNodes, ...clusterNodes],
    [zoneNodes, cardNodes, clusterNodes]
  );

  const selectedIds = useMemo(
    () => cards.filter((card) => hand.selected.has(card.clientId)).map((card) => card.clientId),
    [cards, hand.selected]
  );
  const selectedInCluster = useMemo(
    () => cards.filter((card) => hand.selected.has(card.clientId) && card.clusterId !== undefined).length,
    [cards, hand.selected]
  );
  const clusterTargets = useMemo(
    () => clusters.map((cluster) => ({ clusterId: cluster._id as string, name: cluster.name })),
    [clusters]
  );
  const clearSelection = hand.clearSelection;
  const onGroup = useCallback(() => {
    clusterActions?.form(selectedIds);
    clearSelection();
  }, [clusterActions, selectedIds, clearSelection]);
  const onAddTo = useCallback(
    (clusterId: string) => {
      clusterActions?.addTo(clusterId as Id<"retroClusters">, selectedIds);
      clearSelection();
    },
    [clusterActions, selectedIds, clearSelection]
  );
  const onRemove = useCallback(() => {
    clusterActions?.removeFrom(selectedIds);
    clearSelection();
  }, [clusterActions, selectedIds, clearSelection]);

  const onSubmitCard = useCallback(
    async (promptId: string, text: string) => {
      if (!viewer) return false;
      const zone = zones.find((z) => z.promptId === promptId) ?? zones[0];
      const inZone = cards.filter((card) => card.promptId === promptId).length;
      return viewer.cards.create({
        clientId: crypto.randomUUID(),
        text,
        promptId,
        position: placeNewCard(zone, inZone),
      });
    },
    [viewer, zones, cards]
  );

  const onlineCount = viewer ? users.filter((user) => user.isOnline).length : undefined;
  const writerSet = useMemo(() => (named ? new Set(writers) : undefined), [named, writers]);

  return (
    <div
      className="flex h-screen w-screen flex-col bg-white dark:bg-surface-1"
      data-testid="retro-board"
      data-stage={currentStage.kind}
      data-view-stage={viewStage.kind}
      data-zoom-level="detail"
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
          {isStageEmpty(viewStage.kind, cards.length) && <StageEmptyState kind={viewStage.kind} />}
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              nodeTypes={nodeTypes}
              onNodesChange={hand.onNodesChange}
              onNodeDragStop={hand.onNodeDragStop}
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
          {viewer && (
            <SelectionBar
              count={selectedIds.length}
              inCluster={selectedInCluster}
              clusters={clusterTargets}
              onGroup={onGroup}
              onAddTo={onAddTo}
              onRemove={onRemove}
              onClear={clearSelection}
              className="absolute top-3 left-3 rounded-lg border bg-white/95 p-1.5 shadow-md dark:bg-surface-2/95"
            />
          )}
          {viewer && (
            <Button
              type="button"
              className="absolute right-4 bottom-4 shadow-lg"
              onClick={() => setComposing(true)}
            >
              <Plus className="size-4" />
              {ADD_CARD}
            </Button>
          )}
        </div>
        {rosterOpen && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l bg-white p-4 dark:bg-surface-1">
            <RetroRoster
              users={users}
              currentStage={currentStage}
              myUserId={viewer?.userId}
              onSetReady={viewer?.onSetReady}
              writers={writerSet}
              cardCount={cards.length}
            />
          </aside>
        )}
      </div>
      {viewer && (
        <CardComposer
          open={composing}
          onOpenChange={setComposing}
          prompts={retro.format.prompts}
          viewerName={viewer.name}
          attribution={retro.attribution}
          hidden={currentStage.cardsVisible === "hidden"}
          onSubmit={onSubmitCard}
        />
      )}
    </div>
  );
}
