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
import { ReactElement, useCallback, useEffect, useMemo } from "react";
import "@xyflow/react/dist/style.css";
import { debounce } from "lodash";
import type { NodeChange, EdgeChange } from "@xyflow/react";

import { useLatest } from "@/hooks/use-latest";
import { CanvasNavigation } from "./canvas-navigation";
import { RoomSettingsPanel } from "./room-settings-panel";
import { IssuesPanel } from "./issues-panel";
import { DemoExplainer } from "./demo-explainer";
import { useCanvasNodes } from "./hooks/useCanvasNodes";
import { useCanvasActions } from "./hooks/useCanvasActions";
import { useCardSelection } from "./hooks/useCardSelection";
import { usePanelState } from "./hooks/usePanelState";
import { useDeleteConfirmation } from "./hooks/useDeleteConfirmation";
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
import type { RoomWithRelatedData } from "@/convex/model/rooms";
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

  // Permission flags for the current user
  const permissions = usePermissions(roomData, currentUserId);

  // Stable wrapper so passing it into useCanvasNodes doesn't change identity on
  // every render. `permissions` is memoized, so this only changes when it does.
  const canRemoveTarget = useCallback(
    (targetRole: MemberRole) => permissions.removeTarget(targetRole).allowed,
    [permissions]
  );

  const roomId = roomData.room._id as Id<"rooms">;

  // Card selection: local highlight + server-sync restore/clear. The value is
  // read during render to mark cards selected; the setter is injected into the
  // actions module so picking a card sets it optimistically.
  const { selectedCardValue, setSelectedCardValue } = useCardSelection({
    roomData,
    currentUserId,
  });

  // All backend writes, behind one frozen-identity object. Demo-vs-real is
  // resolved internally via the demo context — under /demo every method no-ops.
  const actions = useCanvasActions({ roomId, currentUserId, setSelectedCardValue });

  // Docked-panel state: mutual exclusion + Escape-to-close.
  const { isIssuesPanelOpen, isSettingsOpen, openIssues, openSettings, closeAll } =
    usePanelState();

  // Destructive-flow branching, built on the actions primitives.
  const {
    pendingNote,
    pendingPlayer,
    requestDeleteNote,
    requestDeletePlayer,
    confirmNote,
    confirmPlayer,
    dismissNote,
    dismissPlayer,
  } = useDeleteConfirmation({
    deleteNote: actions.deleteNote,
    removeUser: actions.removeUser,
  });

  // Use the canvas nodes hook to get persisted nodes. Every node-embedded
  // handler below has a frozen identity, so the node-builder memo never churns.
  const { nodes: layoutNodes, edges: layoutEdges, currentIssue, hasNoteForCurrentIssue } = useCanvasNodes({
    roomId,
    roomData,
    currentUserId,
    selectedCardValue,
    isDemoMode,
    canRevealCards: permissions.revealCards,
    canControlGameFlow: permissions.gameFlow,
    canChangeRoomSettings: permissions.roomSettings,
    canRemoveTarget,
    onRevealCards: actions.reveal,
    onResetGame: actions.reset,
    onCardSelect: actions.selectCard,
    onToggleAutoComplete: actions.toggleAutoComplete,
    onCancelAutoReveal: actions.cancelAutoReveal,
    onOpenIssuesPanel: openIssues,
    onUpdateNoteContent: actions.updateNoteContent,
    onDeleteNote: requestDeleteNote,
  });

  // Update nodes and edges when layout changes
  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  useEffect(() => {
    setEdges(layoutEdges);
  }, [layoutEdges, setEdges]);

  // Debounced position update to prevent database overload. The debounce stays
  // at the call site; the write itself (and its demo/user guards) lives in the
  // stable actions module, so this memo never rebuilds.
  const debouncedPositionUpdate = useMemo(
    () =>
      debounce((nodeId: string, position: { x: number; y: number }) => {
        actions.updateNodePosition(nodeId, position);
      }, 100),
    [actions]
  );

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
            requestDeleteNote(change.id, !!node.data.content);
          } else if (node?.type === "player") {
            const playerData = node.data as PlayerNodeData;
            // `canRemove` was resolved when the node was built; honor it here
            // too so the delete key can't bypass the permission gate.
            if (playerData.canRemove) {
              requestDeletePlayer(playerData.user._id, playerData.user.name, playerData.isCurrentUser);
            }
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
    [onNodesChange, debouncedPositionUpdate, nodesRef, requestDeleteNote, requestDeletePlayer]
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
            onIssuesPanelChange={(open) => (open ? openIssues() : closeAll())}
            isSettingsOpen={isSettingsOpen}
            onSettingsPanelChange={(open) => (open ? openSettings() : closeAll())}
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
          onCreateNote={() => currentIssue && actions.createNote(currentIssue._id)}
          isDemoMode={isDemoMode}
        />
      )}

      {/* Demo explainer - only shown in demo mode, not when embedded */}
      {isDemoMode && !isEmbedded && <DemoExplainer />}

      {/* Delete note confirmation dialog */}
      <AlertDialog
        open={!!pendingNote}
        onOpenChange={(open) => !open && dismissNote()}
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
            <AlertDialogAction variant="destructive" onClick={confirmNote}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove user confirmation dialog */}
      <AlertDialog
        open={!!pendingPlayer}
        onOpenChange={(open) => !open && dismissPlayer()}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingPlayer?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the user from the room. They can rejoin using the room link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmPlayer}>
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
        onClose={closeAll}
        isDemoMode={isDemoMode}
      />

      {/* Issues Panel */}
      <IssuesPanel
        roomId={roomId}
        roomName={roomData.room.name}
        isOpen={isIssuesPanelOpen}
        onClose={closeAll}
        isDemoMode={isDemoMode}
        canManageIssues={permissions.issueManagement}
        canControlGameFlow={permissions.gameFlow}
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
