"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Edge } from "@xyflow/react";
import { useMemo, useRef, useEffect } from "react";
import { DEMO_VIEWER_ID, type CustomNodeType } from "../types";
import type { RoomWithRelatedData, SanitizedVote } from "@/convex/model/rooms";
import type { RoomUserData } from "@/convex/model/users";
import type { MemberRole } from "@/convex/permissions";
import { DEFAULT_SCALE } from "@/convex/scales";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";

// Layout constants for voting cards (matching backend canvas.ts)
const CANVAS_CENTER_X = 0;
const VOTING_CARD_Y = 450;
const VOTING_CARD_SPACING = 70;

interface UseCanvasNodesProps {
  roomId: Id<"rooms">;
  roomData: RoomWithRelatedData;
  currentUserId?: string;
  selectedCardValue: string | null;
  isDemoMode?: boolean;
  canRevealCards?: boolean;
  canControlGameFlow?: boolean;
  canChangeRoomSettings?: boolean;
  canRemoveTarget?: (targetRole: MemberRole) => boolean;
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

export function useCanvasNodes({
  roomId,
  roomData,
  currentUserId,
  selectedCardValue,
  isDemoMode = false,
  canRevealCards = true,
  canControlGameFlow = true,
  canChangeRoomSettings = true,
  canRemoveTarget,
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
  const demo = useDemoSimulation();

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

  // Store callbacks in refs to avoid adding them to useMemo dependency arrays
  // Based on Vercel React Best Practices: advanced-use-latest
  const callbackRefs = useRef({
    onRevealCards,
    onResetGame,
    onCardSelect,
    onToggleAutoComplete,
    onCancelAutoReveal,
    onOpenIssuesPanel,
    onUpdateNoteContent,
    onDeleteNote,
  });

  // Keep refs updated with latest callbacks
  useEffect(() => {
    callbackRefs.current = {
      onRevealCards,
      onResetGame,
      onCardSelect,
      onToggleAutoComplete,
      onCancelAutoReveal,
      onOpenIssuesPanel,
      onUpdateNoteContent,
      onDeleteNote,
    };
  }, [
    onRevealCards,
    onResetGame,
    onCardSelect,
    onToggleAutoComplete,
    onCancelAutoReveal,
    onOpenIssuesPanel,
    onUpdateNoteContent,
    onDeleteNote,
  ]);

  // Check if a note exists for the current issue
  const hasNoteForCurrentIssue = useMemo(() => {
    if (!currentIssueId || !canvasNodes) return false;
    return canvasNodes.some(
      (n) => n.type === "note" && n.data.issueId === currentIssueId
    );
  }, [currentIssueId, canvasNodes]);

  /* eslint-disable react-hooks/refs -- callbacks via refs are only called during user interactions, not render */
  const nodes = useMemo(() => {
    if (!canvasNodes || !roomData) return [];

    const { room, users, votes } = roomData;
    const allNodes: CustomNodeType[] = [];

    // Process each canvas node
    canvasNodes.forEach((node) => {
      if (node.type === "player") {
        const userId = node.data.userId;
        const user = users.find((u: RoomUserData) => u._id === userId);
        if (!user) return;

        const userVote = votes.find((v: SanitizedVote) => v.userId === userId);

        const userRole = user.role ?? "participant";
        const playerNode: CustomNodeType = {
          id: node.nodeId,
          type: "player",
          position: node.position,
          data: {
            user,
            isCurrentUser: userId === currentUserId,
            isCardPicked: userVote?.hasVoted || false,
            card: room.isGameOver ? userVote?.cardLabel || null : null,
            isGameOver: room.isGameOver,
            role: userRole,
            canRemove: canRemoveTarget ? canRemoveTarget(userRole) : true,
          },
          draggable: !node.isLocked,
        };
        allNodes.push(playerNode);
      } else if (node.type === "timer") {
        const timerNode: CustomNodeType = {
          id: node.nodeId,
          type: "timer",
          position: node.position,
          data: {
            ...node.data,
            roomId,
            userId: currentUserId,
            nodeId: node.nodeId,
          },
          draggable: !node.isLocked,
        };
        allNodes.push(timerNode);
      } else if (node.type === "session") {
        const sessionNode: CustomNodeType = {
          id: node.nodeId,
          type: "session",
          position: node.position,
          data: {
            sessionName: room.name || "Planning Session",
            participantCount: users.filter((u) => !u.isSpectator).length,
            voteCount: votes.filter((v: SanitizedVote) => v.hasVoted).length,
            isVotingComplete: room.isGameOver,
            hasVotes: votes.some((v: SanitizedVote) => v.hasVoted),
            autoCompleteVoting: room.autoCompleteVoting,
            autoRevealCountdownStartedAt: room.autoRevealCountdownStartedAt ?? null,
            currentIssue: currentIssueId
              ? { id: currentIssueId, title: currentIssueTitle ?? "" }
              : null,
            canRevealCards,
            canControlGameFlow,
            canChangeRoomSettings,
            onRevealCards: callbackRefs.current.onRevealCards,
            onResetGame: callbackRefs.current.onResetGame,
            onToggleAutoComplete: callbackRefs.current.onToggleAutoComplete,
            onCancelAutoReveal: callbackRefs.current.onCancelAutoReveal,
            onOpenIssuesPanel: callbackRefs.current.onOpenIssuesPanel,
          },
          draggable: !node.isLocked,
        };
        allNodes.push(sessionNode);
      } else if (node.type === "results" && room.isGameOver) {
        const resultsNode: CustomNodeType = {
          id: node.nodeId,
          type: "results",
          position: node.position,
          data: {
            votes: votes.filter((v: SanitizedVote) => v.hasVoted),
            users: users,
            isNumericScale: room.votingScale?.isNumeric ?? true,
          },
          draggable: !node.isLocked,
        };
        allNodes.push(resultsNode);
      } else if (node.type === "note") {
        // Only show note if it belongs to the current issue
        const noteIssueId = node.data.issueId;
        if (currentIssueId && noteIssueId === currentIssueId) {
          const noteContent = node.data.content || "";
          // Capture nodeId for closure - refs ensure we always call latest callback
          const nodeId = node.nodeId;
          const noteNode: CustomNodeType = {
            id: nodeId,
            type: "note",
            position: node.position,
            data: {
              issueId: noteIssueId,
              issueTitle: node.data.issueTitle || currentIssueTitle || "",
              content: noteContent,
              lastUpdatedBy: node.data.lastUpdatedBy,
              lastUpdatedAt: node.data.lastUpdatedAt,
              onUpdateContent: (content: string) => {
                callbackRefs.current.onUpdateNoteContent?.(nodeId, content);
              },
              onDelete: () => {
                callbackRefs.current.onDeleteNote?.(nodeId, !!noteContent);
              },
            },
            draggable: !node.isLocked,
          };
          allNodes.push(noteNode);
        }
      }
    });

    // Generate voting cards client-side for non-spectator users or demo mode
    const shouldShowVotingCards = currentUserId
      ? !users.find((u: RoomUserData) => u._id === currentUserId)?.isSpectator
      : isDemoMode;

    if (shouldShowVotingCards) {
      const cards = room.votingScale?.cards ?? DEFAULT_SCALE.cards;
      const cardCount = cards.length;
      const totalWidth = (cardCount - 1) * VOTING_CARD_SPACING;
      const startX = CANVAS_CENTER_X - totalWidth / 2;
      const effectiveUserId = currentUserId ?? DEMO_VIEWER_ID;

      cards.forEach((cardValue, index) => {
        const votingCardNode: CustomNodeType = {
          id: `card-${effectiveUserId}-${index}`,
          type: "votingCard",
          position: { x: startX + index * VOTING_CARD_SPACING, y: VOTING_CARD_Y },
          data: {
            card: { value: cardValue },
            userId: effectiveUserId,
            roomId,
            isSelectable: !room.isGameOver && !isDemoMode,
            isSelected: cardValue === selectedCardValue,
            onCardSelect: isDemoMode ? undefined : callbackRefs.current.onCardSelect,
          },
          selected: cardValue === selectedCardValue,
          draggable: false,
        };
        allNodes.push(votingCardNode);
      });
    }

    return allNodes;
    // Callbacks are accessed via callbackRefs to avoid adding them as dependencies
    // This reduces re-computations from 15 deps to 8 deps
  }, [canvasNodes, roomData, currentUserId, selectedCardValue, roomId, currentIssueId, currentIssueTitle, isDemoMode, canRevealCards, canControlGameFlow, canChangeRoomSettings, canRemoveTarget]);
  /* eslint-enable react-hooks/refs */

  const edges = useMemo(() => {
    if (!canvasNodes || !roomData) return [];

    const { room, users } = roomData;
    const allEdges: Edge[] = [];

    // Session to Players edges (subtle, consistent with timer edge)
    users.forEach((user: RoomUserData) => {
      allEdges.push({
        id: `session-to-player-${user._id}`,
        source: "session-current",
        sourceHandle: "bottom",
        target: `player-${user._id}`,
        targetHandle: "top",
        type: "default",
        animated: false,
        style: {
          stroke: "#64748b",
          strokeWidth: 2,
          strokeOpacity: 0.6,
        },
      });
    });

    // Session to Results edge (when game is over)
    if (room.isGameOver) {
      allEdges.push({
        id: "session-to-results",
        source: "session-current",
        sourceHandle: "right",
        target: "results",
        targetHandle: "left",
        type: "straight",
        animated: false,
        style: {
          stroke: "#10b981",
          strokeWidth: 2,
          strokeDasharray: "5,5",
          strokeOpacity: 0.6,
        },
      });
    }

    // Timer to Session edge
    allEdges.push({
      id: "timer-to-session",
      source: "timer",
      sourceHandle: "right",
      target: "session-current",
      targetHandle: "left",
      type: "straight",
      animated: false,
      style: {
        stroke: "#64748b",
        strokeWidth: 2,
        strokeDasharray: "5,5",
        strokeOpacity: 0.6,
      },
    });

    // Session to Note edge (when current issue has a note)
    if (currentIssueId) {
      const noteNode = canvasNodes.find(
        (n) => n.type === "note" && n.data.issueId === currentIssueId
      );
      if (noteNode) {
        allEdges.push({
          id: "session-to-note",
          source: "session-current",
          sourceHandle: "right",
          target: noteNode.nodeId,
          targetHandle: "left",
          type: "straight",
          animated: false,
          style: {
            stroke: "#f59e0b", // Amber color matching note node
            strokeWidth: 2,
            strokeDasharray: "5,5",
            strokeOpacity: 0.6,
          },
        });
      }
    }

    return allEdges;
  }, [canvasNodes, roomData, currentIssueId]);

  return {
    nodes,
    edges,
    currentIssue: currentIssueId ? { _id: currentIssueId, title: currentIssueTitle ?? "" } : null,
    hasNoteForCurrentIssue,
  };
}