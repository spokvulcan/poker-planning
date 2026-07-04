"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Edge } from "@xyflow/react";
import { useMemo } from "react";
import { type CustomNodeType } from "../types";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import {
  type ResolvedDecision,
  RESOLVED_ALLOWED,
} from "@/convex/permissions";
import { phaseOf, type Phase } from "@/convex/phase";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";
import {
  buildCanvasEdges,
  buildCanvasNodes,
  isNoteForIssue,
} from "./buildCanvasNodes";

interface UseCanvasNodesProps {
  roomId: Id<"rooms">;
  roomData: RoomWithRelatedData;
  currentUserId?: Id<"users">;
  selectedCardValue: string | null;
  canRevealCards?: ResolvedDecision;
  canControlGameFlow?: ResolvedDecision;
  canChangeRoomSettings?: ResolvedDecision;
  onRevealCards?: () => void;
  onResetGame?: () => void;
  onCardSelect?: (cardValue: string) => void;
  onToggleAutoComplete?: () => void;
  onCancelAutoReveal?: () => void;
  onOpenIssuesPanel?: () => void;
  onUpdateNoteContent?: (nodeId: string, content: string) => void;
  onDeleteNote?: (nodeId: string, hasContent: boolean) => void;
}

interface UseCanvasNodesReturn {
  nodes: CustomNodeType[];
  edges: Edge[];
  currentIssue: { _id: Id<"issues">; title: string } | null;
  hasNoteForCurrentIssue: boolean;
}

/**
 * The adapter over the pure canvas derivation (#229): selects the data source
 * (Convex vs demo context), derives the phase once per room snapshot, and
 * memoizes the two builder calls. All derivation policy lives in
 * `buildCanvasNodes.ts` — this hook adds nothing but React glue.
 *
 * The input objects are assembled fresh inside each memo body, so the
 * dependency arrays MUST list the individual fields, never the freshly built
 * wrappers — the exhaustive-deps lint cannot catch that mistake; reviewers
 * must.
 */
export function useCanvasNodes({
  roomId,
  roomData,
  currentUserId,
  selectedCardValue,
  canRevealCards = RESOLVED_ALLOWED,
  canControlGameFlow = RESOLVED_ALLOWED,
  canChangeRoomSettings = RESOLVED_ALLOWED,
  onRevealCards,
  onResetGame,
  onCardSelect,
  onToggleAutoComplete,
  onCancelAutoReveal,
  onOpenIssuesPanel,
  onUpdateNoteContent,
  onDeleteNote,
}: UseCanvasNodesProps): UseCanvasNodesReturn {
  // In the Demo simulation, the persisted nodes and the current issue come from
  // context — never from Convex (zero reads, ADR-0003). Real rooms subscribe as
  // before. `"skip"` keeps the hook call unconditional (rules of hooks).
  // The demo signal is derived from the same context that supplies the bypass
  // data (#214), so the two can never disagree.
  const demo = useDemoSimulation();
  const isDemoMode = !!demo;

  const canvasNodesQuery = useQuery(
    api.canvas.getCanvasNodes,
    demo ? "skip" : { roomId },
  );
  const canvasNodes = demo ? demo.canvasNodes : canvasNodesQuery;

  const currentIssueQuery = useQuery(
    api.issues.getCurrent,
    demo ? "skip" : { roomId },
  );

  // Stabilize currentIssue reference to prevent excessive re-renders
  const currentIssueId = demo ? demo.currentIssue._id : currentIssueQuery?._id;
  const currentIssueTitle = demo
    ? demo.currentIssue.title
    : currentIssueQuery?.title;
  const currentIssue = useMemo(
    () =>
      currentIssueId
        ? { _id: currentIssueId, title: currentIssueTitle ?? "" }
        : null,
    [currentIssueId, currentIssueTitle],
  );

  // Check if a note exists for the current issue
  const hasNoteForCurrentIssue = useMemo(() => {
    if (!canvasNodes) return false;
    return canvasNodes.some((n) => isNoteForIssue(n, currentIssueId));
  }, [currentIssueId, canvasNodes]);

  // The ONE client-side phase derivation (issue #227): node data and edges
  // must branch on this, never on the raw `isGameOver` / countdown fields.
  const phase: Phase | null = roomData ? phaseOf(roomData.room) : null;

  const nodes = useMemo(() => {
    if (!canvasNodes || !roomData || !phase) return [];

    const { room, users, votes } = roomData;
    return buildCanvasNodes({
      phase,
      roomId,
      room: {
        name: room.name,
        autoCompleteVoting: room.autoCompleteVoting,
        autoRevealCountdownStartedAt: room.autoRevealCountdownStartedAt ?? null,
        votingScale: room.votingScale,
      },
      members: users,
      votes,
      canvasNodes,
      currentIssue,
      viewerId: currentUserId,
      selectedCardValue,
      isDemoMode,
      canRevealCards,
      canControlGameFlow,
      canChangeRoomSettings,
      callbacks: {
        onRevealCards,
        onResetGame,
        onCardSelect,
        onToggleAutoComplete,
        onCancelAutoReveal,
        onOpenIssuesPanel,
        onUpdateNoteContent,
        onDeleteNote,
      },
    });
    // Every handler arrives with a frozen identity from the canvas-actions
    // module (and the panel/confirmation hooks), so listing them as memo
    // dependencies is safe — they never churn and the node list never rebuilds.
  }, [
    canvasNodes,
    roomData,
    phase,
    currentUserId,
    selectedCardValue,
    roomId,
    currentIssue,
    isDemoMode,
    canRevealCards,
    canControlGameFlow,
    canChangeRoomSettings,
    onRevealCards,
    onResetGame,
    onCardSelect,
    onToggleAutoComplete,
    onCancelAutoReveal,
    onOpenIssuesPanel,
    onUpdateNoteContent,
    onDeleteNote,
  ]);

  // The edges builder reads a strict subset of the nodes input, so this memo
  // depends on `users` rather than all of `roomData` — edges stop recomputing
  // on unrelated room-data changes.
  const users = roomData?.users;
  const edges = useMemo(() => {
    if (!canvasNodes || !users || !phase) return [];

    return buildCanvasEdges({
      phase,
      members: users,
      canvasNodes,
      currentIssue: currentIssueId ? { _id: currentIssueId } : null,
    });
  }, [canvasNodes, users, phase, currentIssueId]);

  return {
    nodes,
    edges,
    currentIssue,
    hasNoteForCurrentIssue,
  };
}
