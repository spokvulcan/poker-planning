"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ReactFlow, ReactFlowProvider, useStore, type Node, type NodeTypes, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ListChecks, Plus, Users } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { ResolvedDecision } from "@/convex/permissions";
import type { UserWithPresence } from "@/hooks/useRoomPresence";
import { CanvasDotsBackground } from "@/components/canvas-dots-background";
import { Button } from "@/components/ui/button";
import { ACTIONS_TITLE, ADD_CARD, FORMER_MEMBER, HIDDEN_CARD_LABEL, ROSTER_TITLE } from "@/convex/retroCopy";
import { currentStageOf } from "@/convex/model/retroFormats";
import { RetroHeader, type RetroTeam } from "./retro-header";
import { PromptZoneNodeView, type PromptZoneNode } from "./prompt-zone-node";
import { layoutZones } from "./zones";
import { StageNav, type StageControls } from "./stage-nav";
import { StageEmptyState, isStageEmpty } from "./stage-empty-state";
import { RetroRoster } from "./retro-roster";
import { CardNodeView, type CardNode } from "./card-node";
import { ClusterNodeView, type ClusterNode, type ClusterChipActions, type ClusterTarget } from "./cluster-node";
import { HullNodeView, type HullNode } from "./hull-node";
import { hullsFor } from "./hulls";
import { MobileChrome } from "./mobile-chrome";
import { cardSizeAt, headlineOf, zoomLevelOf, type ZoomLevel } from "./zoom";
import { useIsMobile } from "@/hooks/use-mobile";
import { SelectionBar } from "./selection-bar";
import { clusterChips, tidyPositions, type Member, type Size } from "./clusters";
import type { ClusterActions } from "./use-cluster-actions";
import { CardComposer } from "./card-composer";
import { CARD_MIN_HEIGHT, placeNewCard, type BoardCard } from "./cards";
import { useHand } from "./use-hand";
import { editingOf } from "./readiness";
import type { CardActions } from "./use-card-actions";
import type { DotActions } from "./use-dot-actions";
import type { TallyRead, TopicRef } from "@/convex/model/retroVotes";
import { dotsLeft, dotsOf, topicKey } from "./dots";
import type { DotControlsProps } from "./dot-controls";
import { VoteBudget } from "./vote-budget";
import type { TopicRef as WalkTopicRef, WalkRead } from "@/convex/model/walk";
import type { WalkActions } from "./use-walk-actions";
import { WalkPanel, type WalkPanelActions } from "./walk-panel";
import type { ActionsRead } from "@/convex/model/retroActions";
import type { ActionActions } from "./use-action-actions";
import { ActionsPanel } from "./actions-panel";
import { ReviewPanel } from "./review-panel";
import type { ActionSource } from "./action-composer";

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
  /** The dot writes (spec §11); present whenever the tally is. */
  dots?: DotActions;
  /** The walk's `stageFlow` acts (spec §12.2). */
  walk?: WalkActions;
  /** The action item writes (spec §13); absent for a Team reader. */
  actionItems?: ActionActions;
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
  /** The tally, mounted only while the shared pointer is in `vote` or `discuss` (spec §9). */
  tally?: TallyRead;
  /** The walk as the board read projects it (spec §12.3), once one exists. */
  walk?: WalkRead;
  /** This retro's action items (spec §13); undefined while loading. */
  actions?: ActionsRead;
  /** The carryover (spec §13): the Team's open items from other retros; undefined while loading or without a review entry. */
  review?: ActionsRead;
  /** The header's menu, for attendees. */
  menu?: ReactNode;
  /** A line under the header: the non-attending Team reader's (ADR-0009). */
  banner?: ReactNode;
}

// Outside the component so React Flow sees one stable object.
const nodeTypes: NodeTypes = {
  zone: PromptZoneNodeView,
  card: CardNodeView,
  cluster: ClusterNodeView,
  hull: HullNodeView,
};

/** React Flow elevates a selected node to 1000; a chip stays above its members either way. */
const CHIP_Z_INDEX = 1001;


const selectZoomLevel = (state: { transform: [number, number, number] }) => zoomLevelOf(state.transform[2]);

/** Inside the provider: reports the semantic level whenever the viewport crosses a boundary. */
function ZoomLevelSync({ onLevel }: { onLevel: (level: ZoomLevel) => void }) {
  const level = useStore(selectZoomLevel);
  useEffect(() => onLevel(level), [level, onLevel]);
  return null;
}

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
 * (ADR-0010). `data-zoom-level` follows the viewport through the three
 * semantic levels (spec §10.2); the cards and the chips read the level, the
 * board stores nothing about it.
 *
 * On a phone (spec §10.4) the header and strip give way to one stage pill
 * and one bottom sheet, the canvas pans on one finger, and grouping is
 * tap-select-then-group with the selection held in the hand.
 *
 * Clusters are identities (spec §10.3): the chip at the members' centroid
 * is derived here from the cluster rows and the cards' derived positions,
 * so it follows a drag without a write. The selection bar turns a
 * selection into a cluster; tidy computes the grid here and issues the
 * one move batch.
 *
 * The walk (spec §12.3) shows while the shared pointer is the `discuss`
 * entry it is keyed to: the panel beside the canvas, coverage on the
 * chips, Raise on any topic outside it, and a pan for whoever follows the
 * cursor. Go is `setCenter` on the topic's derived position.
 *
 * Action items (spec §13): one panel reachable at every stage, opened by
 * itself when the shared pointer reaches `close`; "Add action" on the
 * walk's current topic opens it with the source filled. The review panel
 * foregrounds the Team's older open items while the viewed entry is
 * `review`.
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
  tally,
  walk,
  actions,
  review,
}: RetroBoardProps) {
  const currentStage = currentStageOf(retro);
  /** The viewer's own view; null follows the shared pointer. */
  const [viewStageId, setViewStageId] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [pendingSource, setPendingSource] = useState<ActionSource | undefined>(undefined);
  const [composing, setComposing] = useState(false);
  const [level, setLevel] = useState<ZoomLevel>("detail");
  const isMobile = useIsMobile();
  const viewStage = retro.stages.find((stage) => stage.id === viewStageId) ?? currentStage;

  // The page is titled by the retro's name (spec §18.1). Set here rather than
  // in the route's metadata, which would have to fetch the room server-side
  // on every room load, poker included, to learn the type.
  useEffect(() => {
    document.title = `${name} | AgileKit`;
  }, [name]);

  // The close entry foregrounds the actions panel (spec §7); a person may
  // close it again, and it stays reachable from the header at any stage.
  const atClose = currentStage.kind === "close";
  useEffect(() => {
    if (atClose) setActionsOpen(true);
  }, [atClose]);

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

  const hand = useHand({ cards, onDrop: viewer?.cards.move ?? noMoves, tapSelect: isMobile });

  // Dots (spec §11): a topic is a cluster or a loose card; a grouped card
  // shows and gives back the viewer's own dots on it, and takes no more.
  const dotActions = viewer?.dots;
  const takesDots = tally !== undefined && tally.budget !== undefined && dotActions !== undefined;
  const dotsFor = useCallback(
    (target: TopicRef, topic: boolean): DotControlsProps | undefined => {
      if (tally === undefined) return undefined;
      const shown = dotsOf(tally, topicKey(target));
      return {
        ...(topic ? shown : { mine: shown.mine }),
        ...(takesDots && topic ? { onPlace: () => dotActions!.place(target) } : {}),
        ...(takesDots && (topic || shown.mine > 0) ? { onRemove: () => dotActions!.remove(target) } : {}),
      };
    },
    [tally, takesDots, dotActions]
  );

  // The walk (spec §12.3): shown only while the shared pointer is the
  // entry it is keyed to. `inWalk` is the live order, which is what a
  // topic is measured against for Raise and the late marker's clearing.
  const walkShown = walk !== undefined && currentStage.kind === "discuss" && walk.stageEntryId === currentStage.id;
  const inWalk = useMemo(() => new Set(walkShown ? walk.entries.map((entry) => entry.ref.id as string) : []), [walkShown, walk]);
  const coveredIds = useMemo(
    () => new Set(walkShown ? walk.entries.filter((entry) => entry.covered).map((entry) => entry.ref.id as string) : []),
    [walkShown, walk]
  );
  const walkActions = viewer?.walk;
  const stageFlow = viewer?.controls.stageFlow;
  const raiseCluster = useMemo(
    () =>
      walkShown && walkActions && stageFlow
        ? { decision: stageFlow, onRaise: (id: Id<"retroClusters">) => walkActions.raise({ kind: "cluster", id }) }
        : undefined,
    [walkShown, walkActions, stageFlow]
  );
  const cardById = useMemo(() => new Map(cards.map((card) => [card._id as string, card])), [cards]);
  const raiseCard = useMemo(
    () =>
      walkShown && walkActions && stageFlow
        ? {
            decision: stageFlow,
            onRaise: (clientId: string) => {
              const card = cards.find((c) => c.clientId === clientId);
              if (card) walkActions.raise({ kind: "card", id: card._id });
            },
          }
        : undefined,
    [walkShown, walkActions, stageFlow, cards]
  );

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
          // On a phone the selection stays out of React Flow's view (see useHand).
          selected: !isMobile && hand.selected.has(card.clientId),
          draggable: editable,
          data: {
            card,
            color: tintByPrompt.get(card.promptId) ?? "",
            ...(named && card.authorId !== undefined
              ? { authorName: namesById.get(card.authorId) ?? FORMER_MEMBER }
              : {}),
            ...(editingBy.has(card.clientId) ? { editingBy: editingBy.get(card.clientId) } : {}),
            editable,
            level,
            ...(isMobile && hand.selected.has(card.clientId) ? { tapSelected: true } : {}),
            ...(tally !== undefined && !card.hidden
              ? { dots: dotsFor({ kind: "card", id: card._id }, card.clusterId === undefined) }
              : {}),
            ...(viewer && editable
              ? { onEditText: viewer.cards.editText, onDelete: viewer.cards.remove, onEditing: viewer.onEditing }
              : {}),
            // A loose card outside the walk is raisable from the board (ADR-0023).
            ...(raiseCard && !card.hidden && card.clusterId === undefined && !inWalk.has(card._id)
              ? { raise: raiseCard }
              : {}),
          },
        };
      }),
    [cards, viewer, hand.positions, hand.measured, hand.selected, tintByPrompt, named, namesById, editingBy, level, isMobile, tally, dotsFor, inWalk, raiseCard]
  );

  /** The cards as geometry: positions read through the hand, heights as measured. */
  const members = useMemo<Member<Id<"retroClusters">>[]>(
    () =>
      cards.map((card) => {
        const measured = hand.measured.get(card.clientId);
        return {
          clientId: card.clientId,
          position: hand.positions.get(card.clientId) ?? card.position,
          ...(card.clusterId !== undefined ? { clusterId: card.clusterId } : {}),
          ...(measured ? { height: measured.height } : {}),
        };
      }),
    [cards, hand.positions, hand.measured]
  );
  /** The level's card box, for a card not yet measured. */
  const cardSize = useMemo<Size>(() => {
    const size = cardSizeAt(level);
    return { width: size.width, height: size.height ?? CARD_MIN_HEIGHT };
  }, [level]);

  // Hulls only while the shared pointer is in `group` (spec §10.3); the
  // card box is what is drawn, so a hull hugs it.
  const hullNodes = useMemo<HullNode[]>(() => {
    return hullsFor(currentStage.kind, members, cardSize).map(
      (hull): HullNode => ({
        id: `hull-${hull.key}`,
        type: "hull",
        position: hull.position,
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
        // A rebuilt node is hidden until React Flow measures it again;
        // the hand keeps what it measured (spec §10.5).
        ...(hand.measured.has(`hull-${hull.key}`) ? { measured: hand.measured.get(`hull-${hull.key}`) } : {}),
        data: { hull },
      })
    );
  }, [currentStage.kind, members, cardSize, hand.measured]);

  const chips = useMemo(() => clusterChips(clusters, members, cardSize), [clusters, members, cardSize]);

  const clusterActions = viewer?.clusters;
  const moveCards = viewer?.cards.move;
  const chipActions = useMemo<ClusterChipActions | undefined>(() => {
    if (!clusterActions || !moveCards) return undefined;
    return {
      rename: clusterActions.rename,
      merge: clusterActions.merge,
      dissolve: clusterActions.dissolve,
      tidy: (clusterId) => {
        moveCards(
          tidyPositions(
            members.filter((member) => member.clusterId === clusterId),
            cardSize
          )
        );
      },
    };
  }, [clusterActions, moveCards, members, cardSize]);

  const clusterNodes = useMemo<ClusterNode[]>(
    () =>
      chips.map((chip): ClusterNode => ({
        id: `cluster-${chip.clusterId}`,
        type: "cluster",
        position: chip.position,
        draggable: false,
        selectable: false,
        focusable: false,
        // Above a selected card, which React Flow elevates to 1000.
        zIndex: CHIP_Z_INDEX,
        ...(hand.measured.has(`cluster-${chip.clusterId}`)
          ? { measured: hand.measured.get(`cluster-${chip.clusterId}`) }
          : {}),
        data: {
          chip,
          others: chips.filter((other) => other.clusterId !== chip.clusterId),
          ...(viewer && chipActions ? { decision: viewer.cardManagement, actions: chipActions } : {}),
          ...(tally !== undefined ? { dots: dotsFor({ kind: "cluster", id: chip.clusterId }, true) } : {}),
          ...(walkShown
            ? {
                walk: {
                  inWalk: inWalk.has(chip.clusterId),
                  covered: coveredIds.has(chip.clusterId),
                  ...(raiseCluster ? { raise: raiseCluster } : {}),
                },
              }
            : {}),
        },
      })),
    [chips, viewer, chipActions, tally, dotsFor, hand.measured, walkShown, inWalk, coveredIds, raiseCluster]
  );

  // Go (spec §12.2): `setCenter` on the topic's derived position — a card's
  // box centre through the hand, a cluster's chip — at the current zoom.
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const centerOf = useCallback(
    (ref: WalkTopicRef): { x: number; y: number } | undefined => {
      if (ref.kind === "cluster") return chips.find((chip) => chip.clusterId === ref.id)?.position;
      const card = cardById.get(ref.id);
      if (!card) return undefined;
      const position = hand.positions.get(card.clientId) ?? card.position;
      const measured = hand.measured.get(card.clientId);
      return { x: position.x + cardSize.width / 2, y: position.y + (measured?.height ?? cardSize.height) / 2 };
    },
    [chips, cardById, hand.positions, hand.measured, cardSize]
  );
  const panTo = useCallback(
    (ref: WalkTopicRef) => {
      const flow = flowRef.current;
      const center = centerOf(ref);
      if (!flow || !center) return;
      // No duration: the board re-renders on the same update that moves the
      // cursor, which cuts an animated pan short; an instant one lands.
      void flow.setCenter(center.x, center.y, { zoom: flow.getZoom() });
    },
    [centerOf]
  );
  // Moving the cursor pans whoever follows the walk: the viewers on the
  // shared stage. The first render is left to fitView.
  const cursor = walkShown ? walk.cursor : undefined;
  const cursorRef = walkShown ? walk.entries.find((entry) => entry.index === walk.cursor)?.ref : undefined;
  const seenCursor = useRef(cursor);
  useEffect(() => {
    if (cursor === seenCursor.current) return;
    seenCursor.current = cursor;
    if (cursor !== undefined && cursorRef && viewStageId === null) panTo(cursorRef);
    // The pan reads the position at the moment the cursor moves; a later drag is not a cursor move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const labelOf = useCallback(
    (ref: WalkTopicRef): string => {
      if (ref.kind === "cluster") return clusters.find((cluster) => cluster._id === ref.id)?.name ?? "";
      const card = cardById.get(ref.id);
      return card === undefined || card.hidden ? HIDDEN_CARD_LABEL : headlineOf(card.text ?? "");
    },
    [clusters, cardById]
  );
  const walkPanelActions = useMemo<WalkPanelActions | undefined>(
    () =>
      walkActions && stageFlow
        ? {
            decision: stageFlow,
            onSetCursor: walkActions.setCursor,
            onMarkCovered: walkActions.markCovered,
            onRaise: walkActions.raise,
          }
        : undefined,
    [walkActions, stageFlow]
  );
  const actionItems = viewer?.actionItems;
  // "Add action" on the walk's current topic (spec §13): the panel opens
  // with the source filled; the composer writes it.
  const onAddAction = useMemo(
    () =>
      actionItems
        ? (ref: WalkTopicRef) => {
            setPendingSource({ ref, label: labelOf(ref) });
            setActionsOpen(true);
          }
        : undefined,
    [actionItems, labelOf]
  );
  const clearSource = useCallback(() => setPendingSource(undefined), []);
  const walkPanel = walkShown && (
    <WalkPanel walk={walk} labelOf={labelOf} onGo={panTo} actions={walkPanelActions} onAddAction={onAddAction} />
  );
  const actionsPanel = actionsOpen && (
    <ActionsPanel
      roomId={retro.roomId}
      read={actions}
      atClose={atClose}
      actions={actionItems}
      source={pendingSource}
      onClearSource={clearSource}
    />
  );
  const reviewPanel = viewStage.kind === "review" && <ReviewPanel read={review} actions={actionItems} />;
  const actionsToggle = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={ACTIONS_TITLE}
      aria-pressed={actionsOpen}
      onClick={() => setActionsOpen((open) => !open)}
    >
      <ListChecks className="size-4" />
      {actions !== undefined ? actions.items.length : ""}
    </Button>
  );

  // Zones, then hulls (same z, later in order so they draw above), cards, chips.
  const nodes = useMemo<Node[]>(
    () => [...zoneNodes, ...hullNodes, ...cardNodes, ...clusterNodes],
    [zoneNodes, hullNodes, cardNodes, clusterNodes]
  );

  const selectedIds = useMemo(
    () => cards.filter((card) => hand.selected.has(card.clientId)).map((card) => card.clientId),
    [cards, hand.selected]
  );
  const selectedInCluster = useMemo(
    () => cards.filter((card) => hand.selected.has(card.clientId) && card.clusterId !== undefined).length,
    [cards, hand.selected]
  );
  // Only a cluster with members is a target: an emptied one keeps its row but shows nowhere.
  const clusterTargets = useMemo<ClusterTarget[]>(
    () => chips.map((chip) => ({ clusterId: chip.clusterId, name: chip.name })),
    [chips]
  );
  const clearSelection = hand.clearSelection;
  const onGroup = useCallback(() => {
    clusterActions?.form(selectedIds);
    clearSelection();
  }, [clusterActions, selectedIds, clearSelection]);
  const onAddTo = useCallback(
    (clusterId: Id<"retroClusters">) => {
      clusterActions?.addTo(clusterId, selectedIds);
      clearSelection();
    },
    [clusterActions, selectedIds, clearSelection]
  );
  const onRemove = useCallback(() => {
    clusterActions?.removeFrom(selectedIds);
    clearSelection();
  }, [clusterActions, selectedIds, clearSelection]);
  const selection = viewer
    ? {
        count: selectedIds.length,
        inCluster: selectedInCluster,
        clusters: clusterTargets,
        onGroup,
        onAddTo,
        onRemove,
        onClear: clearSelection,
      }
    : undefined;


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

  const left = dotsLeft(tally);
  const budget =
    viewer && tally?.budget !== undefined && left !== undefined ? (
      <VoteBudget left={left} budget={tally.budget} anonymous={retro.attribution === "anonymous"} />
    ) : null;

  const onlineCount = viewer ? users.filter((user) => user.isOnline).length : undefined;
  const writerSet = useMemo(() => (named ? new Set(writers) : undefined), [named, writers]);

  const canvas = (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={hand.onNodesChange}
        onNodeDragStop={hand.onNodeDragStop}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={4}
        nodesConnectable={false}
        onlyRenderVisibleElements
        panOnScroll
        // A phone pans on one finger; a desktop pans on the primary button
        // and trackpad and draws a marquee on drag.
        panOnDrag={isMobile ? true : [1, 2]}
        selectionOnDrag={!isMobile}
        zoomOnPinch
        preventScrolling={false}
      >
        <CanvasDotsBackground />
        <ZoomLevelSync onLevel={setLevel} />
      </ReactFlow>
    </ReactFlowProvider>
  );

  const composer = viewer && (
    <CardComposer
      open={composing}
      onOpenChange={setComposing}
      prompts={retro.format.prompts}
      viewerName={viewer.name}
      attribution={retro.attribution}
      hidden={currentStage.cardsVisible === "hidden"}
      onSubmit={onSubmitCard}
    />
  );

  const roster = (
    <RetroRoster
      users={users}
      currentStage={currentStage}
      myUserId={viewer?.userId}
      onSetReady={viewer?.onSetReady}
      writers={writerSet}
      cardCount={cards.length}
    />
  );

  const stageNav = (
    <StageNav
      stages={retro.stages}
      currentStageId={currentStage.id}
      viewStageId={viewStageId}
      onView={setViewStageId}
      controls={viewer?.controls}
    />
  );

  if (isMobile) {
    return (
      <div
        className="relative h-dvh w-screen overflow-hidden bg-white dark:bg-surface-1"
        data-testid="retro-board"
        data-stage={currentStage.kind}
        data-view-stage={viewStage.kind}
        data-zoom-level={level}
        data-chrome="mobile"
      >
        {isStageEmpty(viewStage.kind, cards.length) && <StageEmptyState kind={viewStage.kind} />}
        {canvas}
        <MobileChrome
          name={name}
          teamName={team?.name}
          stageKind={currentStage.kind}
          timeboxMinutes={currentStage.timeboxMinutes}
          enteredAt={retro.currentStageEnteredAt}
          selection={selection}
          onCompose={viewer ? () => setComposing(true) : undefined}
          note={budget}
        >
          {banner}
          {stageNav}
          {reviewPanel && <div className="border-t pt-3">{reviewPanel}</div>}
          {walkPanel && <div className="border-t pt-3">{walkPanel}</div>}
          <div className="flex justify-end gap-1">
            {actionsToggle}
            {menu}
          </div>
          {actionsPanel && <div className="border-t pt-3">{actionsPanel}</div>}
          {roster}
        </MobileChrome>
        {composer}
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-screen flex-col bg-white dark:bg-surface-1"
      data-testid="retro-board"
      data-stage={currentStage.kind}
      data-view-stage={viewStage.kind}
      data-zoom-level={level}
      data-chrome="desktop"
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
            {actionsToggle}
            {menu}
          </>
        }
      />
      {banner}
      {stageNav}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {isStageEmpty(viewStage.kind, cards.length) && <StageEmptyState kind={viewStage.kind} />}
          {canvas}
          <div className="absolute top-3 left-3 flex flex-col items-start gap-2">
            {budget && <div className="rounded-lg border bg-white/95 px-2.5 py-1.5 shadow-md dark:bg-surface-2/95">{budget}</div>}
            {selection && (
              <SelectionBar
                {...selection}
                className="rounded-lg border bg-white/95 p-1.5 shadow-md dark:bg-surface-2/95"
              />
            )}
          </div>
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
        {reviewPanel && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l bg-white p-4 dark:bg-surface-1">{reviewPanel}</aside>
        )}
        {walkPanel && (
          <aside className="w-72 shrink-0 overflow-y-auto border-l bg-white p-4 dark:bg-surface-1">{walkPanel}</aside>
        )}
        {actionsPanel && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l bg-white p-4 dark:bg-surface-1">{actionsPanel}</aside>
        )}
        {rosterOpen && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l bg-white p-4 dark:bg-surface-1">{roster}</aside>
        )}
      </div>
      {composer}
    </div>
  );
}
