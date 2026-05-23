"use client";

import {
  ReactFlow,
  Edge,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  NodeTypes,
  ReactFlowProvider,
  useReactFlow,
  ConnectionMode,
} from "@xyflow/react";
import { ReactElement, useCallback, useEffect, useState, useMemo } from "react";
import "@xyflow/react/dist/style.css";
import { debounce } from "lodash";
import type { NodeChange, EdgeChange } from "@xyflow/react";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLatest } from "@/hooks/use-latest";
import { CanvasNavigation } from "./canvas-navigation";
import { RoomSettingsPanel } from "./room-settings-panel";
import { IssuesPanel } from "./issues-panel";
import { DemoExplainer } from "./demo-explainer";
import { useCanvasNodes } from "./hooks/useCanvasNodes";
import { NodePickerToolbar } from "./node-picker-toolbar";
import { Id } from "@/convex/_generated/dataModel";
import {
  NoteNode,
  PlayerNode,
  ResultsNode,
  StoryNode,
  SessionNode,
  TimerNode,
  VotingCardNode,
} from "./nodes";
import { DEMO_VIEWER_ID, type CustomNodeType, type PlayerNodeData } from "./types";
import type { RoomWithRelatedData, SanitizedVote } from "@/convex/model/rooms";
import { usePermissions } from "@/hooks/usePermissions";
import type { MemberRole } from "@/convex/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RoomCanvasProps {
  roomData: RoomWithRelatedData;
  currentUserId?: Id<"users">;
  isDemoMode?: boolean;
  isEmbedded?: boolean;
}

// Define node types outside component to prevent re-renders
const nodeTypes: NodeTypes = {
  note: NoteNode,
  player: PlayerNode,
  story: StoryNode,
  session: SessionNode,
  votingCard: VotingCardNode,
  results: ResultsNode,
  timer: TimerNode,
} as const;

function RoomCanvasInner({ roomData, currentUserId, isDemoMode = false, isEmbedded = false }: RoomCanvasProps): ReactElement {
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  // Stable ref for nodes - prevents callback recreation on layout changes
  // Based on Vercel React Best Practices: advanced-use-latest
  const nodesRef = useLatest(nodes);

  // Convex mutations
  const showCards = useMutation(api.rooms.showCards);
  const resetGame = useMutation(api.rooms.resetGame);
  const pickCard = useMutation(api.votes.pickCard);
  const updateNodePosition = useMutation(api.canvas.updateNodePosition);
  const toggleAutoComplete = useMutation(api.rooms.toggleAutoComplete);
  const cancelAutoRevealCountdown = useMutation(api.rooms.cancelAutoRevealCountdown);
  const updateNoteContentMutation = useMutation(api.canvas.updateNoteContent);
  const createNoteMutation = useMutation(api.canvas.createNote);
  const deleteNoteMutation = useMutation(api.canvas.deleteNote);
  const removeUser = useMutation(api.users.remove);

  // Permission flags for the current user
  const permissions = usePermissions(roomData, currentUserId);

  // Stable ref for roomId - prevents callback recreation on roomData changes
  // Based on Vercel React Best Practices: advanced-use-latest
  const roomIdRef = useLatest(roomData.room._id);

  const handleRevealCards = useCallback(async () => {
    if (isDemoMode) return;
    try {
      await showCards({ roomId: roomIdRef.current });
    } catch (error) {
      console.error("Failed to show cards:", error);
    }
  }, [isDemoMode, showCards, roomIdRef]);

  const handleResetGame = useCallback(async () => {
    if (isDemoMode) return;
    try {
      await resetGame({ roomId: roomIdRef.current });
    } catch (error) {
      console.error("Failed to reset game:", error);
    }
  }, [isDemoMode, resetGame, roomIdRef]);

  const handleToggleAutoComplete = useCallback(async () => {
    if (isDemoMode) return;
    try {
      await toggleAutoComplete({ roomId: roomIdRef.current });
    } catch (error) {
      console.error("Failed to toggle auto-complete:", error);
    }
  }, [isDemoMode, toggleAutoComplete, roomIdRef]);

  const handleCancelAutoReveal = useCallback(async () => {
    if (isDemoMode) return;
    try {
      await cancelAutoRevealCountdown({ roomId: roomIdRef.current });
    } catch (error) {
      console.error("Failed to cancel auto-reveal:", error);
    }
  }, [isDemoMode, cancelAutoRevealCountdown, roomIdRef]);

  // Track selected cards locally (server doesn't send card value until reveal)
  const [selectedCardValue, setSelectedCardValue] = useState<string | null>(
    null
  );

  // Issues and Settings panel state
  const [isIssuesPanelOpen, setIsIssuesPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Delete note confirmation state
  const [pendingDeleteNodeId, setPendingDeleteNodeId] = useState<string | null>(null);

  // Delete player confirmation state
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<{id: Id<"users">, name: string} | null>(null);

  const handleOpenIssuesPanel = useCallback(() => {
    setIsSettingsOpen(false);
    setIsIssuesPanelOpen(true);
  }, []);

  // Handle note content updates
  const handleUpdateNoteContent = useCallback(
    async (nodeId: string, content: string) => {
      if (isDemoMode || !currentUserId) return;
      try {
        await updateNoteContentMutation({
          roomId: roomIdRef.current,
          nodeId,
          content,
          userId: currentUserId,
        });
      } catch (error) {
        console.error("Failed to update note content:", error);
      }
    },
    [isDemoMode, updateNoteContentMutation, currentUserId, roomIdRef]
  );

  // Handle creating a new note for an issue
  const handleCreateNote = useCallback(
    async (issueId: Id<"issues">) => {
      if (isDemoMode || !currentUserId) return;
      try {
        await createNoteMutation({
          roomId: roomIdRef.current,
          issueId,
          userId: currentUserId,
        });
      } catch (error) {
        console.error("Failed to create note:", error);
      }
    },
    [isDemoMode, createNoteMutation, currentUserId, roomIdRef]
  );

  // Handle note deletion request
  const handleDeleteNote = useCallback(
    (nodeId: string, hasContent: boolean) => {
      if (isDemoMode || !currentUserId) return;
      if (hasContent) {
        // Show confirmation dialog for notes with content
        setPendingDeleteNodeId(nodeId);
      } else {
        // Delete immediately for empty notes
        deleteNoteMutation({
          roomId: roomIdRef.current,
          nodeId,
          userId: currentUserId,
        }).catch((error) => {
          console.error("Failed to delete note:", error);
        });
      }
    },
    [isDemoMode, deleteNoteMutation, roomIdRef, currentUserId]
  );

  // Handle confirmed deletion
  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteNodeId || !currentUserId) return;
    deleteNoteMutation({
      roomId: roomIdRef.current,
      nodeId: pendingDeleteNodeId,
      userId: currentUserId,
    }).catch((error) => {
      console.error("Failed to delete note:", error);
    });
    setPendingDeleteNodeId(null);
  }, [pendingDeleteNodeId, deleteNoteMutation, roomIdRef, currentUserId]);

  // Handle player deletion request (shows confirmation)
  const handleDeletePlayer = useCallback(
    (userId: Id<"users">, userName: string, isCurrentUser: boolean) => {
      if (isDemoMode || isCurrentUser) return;
      // Find the target user's role for permission check
      const targetUser = roomData?.users.find((u) => u._id === userId);
      const targetRole = targetUser?.role ?? "participant";
      if (!permissions.removeTarget(targetRole).allowed) return;
      setPendingDeleteUserId({ id: userId, name: userName });
    },
    [isDemoMode, roomData?.users, permissions]
  );

  // Handle confirmed player deletion
  const handleConfirmDeletePlayer = useCallback(async () => {
    if (!pendingDeleteUserId) return;
    try {
      await removeUser({ userId: pendingDeleteUserId.id, roomId: roomIdRef.current });
    } catch (error) {
      console.error("Failed to remove user:", error);
    }
    setPendingDeleteUserId(null);
  }, [pendingDeleteUserId, removeUser, roomIdRef]);

  // Extract vote state for narrowed effect dependencies
  const userVote = roomData?.votes.find(
    (v: SanitizedVote) => v.userId === currentUserId
  );
  const hasVoted = userVote?.hasVoted;
  const voteLabel = userVote?.cardLabel;

  // Sync local card selection with server state.
  // The server now returns the current user's own vote label even before reveal,
  // so we can restore the selected card after page navigations (e.g. OAuth redirect).
  useEffect(() => {
    if (!roomData || !currentUserId) return;

    if (!hasVoted) {
      setSelectedCardValue(null);
    } else if (voteLabel) {
      setSelectedCardValue(voteLabel);
    }
  }, [currentUserId, roomData, hasVoted, voteLabel]);

  // Handle card selection
  const handleCardSelect = useCallback(
    async (cardValue: string) => {
      if (isDemoMode || !currentUserId) return;

      setSelectedCardValue(cardValue);

      try {
        await pickCard({
          roomId: roomIdRef.current,
          userId: currentUserId,
          cardLabel: cardValue,
          cardValue: parseInt(cardValue) || 0,
        });
      } catch (error) {
        console.error("Failed to pick card:", error);
        setSelectedCardValue(null);
      }
    },
    [isDemoMode, pickCard, currentUserId, roomIdRef]
  );

  // Get room ID
  const roomId = roomData?.room._id as Id<"rooms">;

  // Use the canvas nodes hook to get persisted nodes
  const { nodes: layoutNodes, edges: layoutEdges, currentIssue, hasNoteForCurrentIssue } = useCanvasNodes({
    roomId,
    roomData,
    currentUserId,
    selectedCardValue,
    isDemoMode,
    canRevealCards: permissions.revealCards.allowed,
    canControlGameFlow: permissions.gameFlow.allowed,
    canChangeRoomSettings: permissions.roomSettings.allowed,
    canRemoveTarget: (targetRole: MemberRole) =>
      permissions.removeTarget(targetRole).allowed,
    onRevealCards: handleRevealCards,
    onResetGame: handleResetGame,
    onCardSelect: handleCardSelect,
    onToggleAutoComplete: handleToggleAutoComplete,
    onCancelAutoReveal: handleCancelAutoReveal,
    onOpenIssuesPanel: handleOpenIssuesPanel,
    onUpdateNoteContent: handleUpdateNoteContent,
    onDeleteNote: handleDeleteNote,
  });

  // Update nodes and edges when layout changes
  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  useEffect(() => {
    setEdges(layoutEdges);
  }, [layoutEdges, setEdges]);

  // Debounced position update to prevent database overload
  // Uses roomIdRef to avoid recreating debounced function on roomData changes
  /* eslint-disable react-hooks/refs -- roomIdRef is only read during drag events, not render */
  const debouncedPositionUpdate = useMemo(
    () =>
      debounce((nodeId: string, position: { x: number; y: number }) => {
        if (!currentUserId) return;

        updateNodePosition({
          roomId: roomIdRef.current,
          nodeId,
          position,
          userId: currentUserId,
        }).catch((error) => {
          console.error("Failed to update node position:", error);
        });
      }, 100),
    [currentUserId, updateNodePosition, roomIdRef]
  );
  /* eslint-enable react-hooks/refs */

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedPositionUpdate.cancel();
    };
  }, [debouncedPositionUpdate]);

  // Handle node position changes
  // Uses nodesRef to avoid callback recreation on every layout change
  const handleNodesChange = useCallback(
    (changes: NodeChange<CustomNodeType>[]) => {
      // Filter out all node removals - only note and player nodes trigger delete flows
      const filteredChanges = changes.filter((change) => {
        if (change.type === "remove") {
          const node = nodesRef.current.find((n) => n.id === change.id);
          if (node?.type === "note") {
            handleDeleteNote(change.id, !!node.data.content);
          } else if (node?.type === "player") {
            const playerData = node.data as PlayerNodeData;
            handleDeletePlayer(playerData.user._id, playerData.user.name, playerData.isCurrentUser);
          }
          // Block all removals - deletions go through confirmation handlers
          return false;
        }
        return true;
      });

      // Call the original handler to update local state
      onNodesChange(filteredChanges);

      // Send position updates to database
      filteredChanges.forEach((change) => {
        if (change.type === "position" && change.position && !change.dragging) {
          debouncedPositionUpdate(change.id, change.position);
        }
      });
    },
    [onNodesChange, debouncedPositionUpdate, nodesRef, handleDeleteNote, handleDeletePlayer]
  );

  // Handle edge changes - block all edge deletions
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      // Filter out all edge removals - edges are managed by the system
      const filteredChanges = changes.filter((change) => change.type !== "remove");
      onEdgesChange(filteredChanges);
    },
    [onEdgesChange]
  );

  // Handle connection between nodes - prevent manual connections
  const onConnect = useCallback(() => {
    // Manual connections are not allowed in this application
    return;
  }, []);

  // Fit view when users change with debounce
  useEffect(() => {
    if (!roomData?.users) return;

    const timeoutId = setTimeout(() => {
      fitView({
        padding: 0.1,
        duration: 800,
        maxZoom: 1.2,
        minZoom: 0.6,
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [roomData?.users, fitView]);

  if (!roomData || (!currentUserId && !isDemoMode)) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex w-full h-screen overflow-hidden bg-transparent">
      <div className="flex-1 relative min-w-0 h-full">
        {(isDemoMode || currentUserId) && !(isDemoMode && isEmbedded) && (
          <CanvasNavigation
            roomData={roomData}
            currentUserId={currentUserId ?? DEMO_VIEWER_ID}
            isIssuesPanelOpen={isIssuesPanelOpen}
            onIssuesPanelChange={(open) => {
              setIsIssuesPanelOpen(open);
              if (open) setIsSettingsOpen(false);
            }}
            isSettingsOpen={isSettingsOpen}
            onSettingsPanelChange={(open) => {
              setIsSettingsOpen(open);
              if (open) setIsIssuesPanelOpen(false);
            }}
            isDemoMode={isDemoMode}
          />
        )}
        <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isDemoMode ? undefined : handleNodesChange}
        onEdgesChange={isDemoMode ? undefined : handleEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={{ x: 0, y: 50, zoom: 0.75 }}
        nodesDraggable={!isDemoMode}
        nodesConnectable={false}
        elementsSelectable={!isDemoMode}
        snapToGrid
        snapGrid={[25, 25]}
        preventScrolling={false}
        attributionPosition="bottom-right"
        panOnScroll
        selectionOnDrag={!isDemoMode}
        panOnDrag={[1, 2]}
        translateExtent={[
          [-2000, -2000],
          [2000, 2000],
        ]}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className="*:stroke-gray-300 dark:*:stroke-surface-3"
        />
      </ReactFlow>
      {!isDemoMode && (
        <NodePickerToolbar
          currentIssueId={currentIssue?._id ?? null}
          hasNoteForCurrentIssue={hasNoteForCurrentIssue}
          onCreateNote={() => currentIssue && handleCreateNote(currentIssue._id)}
          isDemoMode={isDemoMode}
        />
      )}

      {/* Demo explainer - only shown in demo mode, not when embedded */}
      {isDemoMode && !isEmbedded && <DemoExplainer />}

      {/* Delete note confirmation dialog */}
      <AlertDialog
        open={!!pendingDeleteNodeId}
        onOpenChange={(open) => !open && setPendingDeleteNodeId(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This note has content. Are you sure you want to delete it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove user confirmation dialog */}
      <AlertDialog
        open={!!pendingDeleteUserId}
        onOpenChange={(open) => !open && setPendingDeleteUserId(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDeleteUserId?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the user from the room. They can rejoin using the room link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDeletePlayer}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>

      {/* Settings Panel */}
      <RoomSettingsPanel
        roomData={roomData}
        currentUserId={isDemoMode ? undefined : (currentUserId as Id<"users">)}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDemoMode={isDemoMode}
      />

      {/* Issues Panel */}
      <IssuesPanel
        roomId={roomId}
        roomName={roomData.room.name}
        isOpen={isIssuesPanelOpen}
        onClose={() => setIsIssuesPanelOpen(false)}
        isDemoMode={isDemoMode}
        canManageIssues={permissions.issueManagement.allowed}
        canControlGameFlow={permissions.gameFlow.allowed}
      />
    </div>
  );
}

export function RoomCanvas(props: RoomCanvasProps): ReactElement {
  return (
    <ReactFlowProvider>
      <RoomCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
