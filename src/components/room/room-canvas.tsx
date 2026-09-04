"use client";

import {
  ReactFlow,
  Edge,
  useEdgesState,
  NodeTypes,
  ReactFlowProvider,
  useReactFlow,
  ConnectionMode,
} from "@xyflow/react";
import { ReactElement, useCallback, useEffect } from "react";
import "@xyflow/react/dist/style.css";
import type { NodeChange, EdgeChange } from "@xyflow/react";

import { CanvasNavigation } from "./canvas-navigation";
import { CanvasDotsBackground } from "@/components/canvas-dots-background";
import { RoomPresenceProvider } from "./room-presence";
import { RoomSettingsPanel } from "./room-settings-panel";
import { IssuesPanel } from "./issues-panel";
import { DemoExplainer } from "./demo-explainer";
import { useIsDemoMode } from "./demo/DemoSimulationProvider";
import { useCanvasNodes } from "./hooks/useCanvasNodes";
import { useCanvasActions } from "./hooks/useCanvasActions";
import { useCardSelection } from "./hooks/useCardSelection";
import { usePanelState } from "./hooks/usePanelState";
import { useDeleteConfirmation } from "./hooks/useDeleteConfirmation";
import { useNodeDragBuffer } from "./hooks/useNodeDragBuffer";
import { NodePickerToolbar } from "./node-picker-toolbar";
import { Id } from "@/convex/_generated/dataModel";
import {
  NoteNode,
  PlayerNode,
  ResultsNode,
  SessionNode,
  TimerNode,
  VotingCardNode,
} from "./nodes";
import { DEMO_VIEWER_ID, type CustomNodeType, type PlayerNodeData } from "./types";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import { usePokerPermissions } from "@/hooks/usePermissions";
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
  isEmbedded?: boolean;
}

// Define node types outside component to prevent re-renders
const nodeTypes: NodeTypes = {
  note: NoteNode,
  player: PlayerNode,
  session: SessionNode,
  votingCard: VotingCardNode,
  results: ResultsNode,
  timer: TimerNode,
} as const;

function RoomCanvasInner({ roomData, currentUserId, isEmbedded = false }: RoomCanvasProps): ReactElement {
  // The demo signal is derived once from the provider seam (#214), matching how
  // the children and hooks below now obtain it; the demo route mounts the
  // provider and is the sole place that decides demo-vs-real.
  const isDemoMode = useIsDemoMode();
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  // Permission flags for the current user
  const permissions = usePokerPermissions(roomData, currentUserId);

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
  const actions = useCanvasActions({
    roomId,
    currentUserId,
    selectedCardValue,
    setSelectedCardValue,
  });

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
    canRevealCards: permissions.revealCards,
    canControlGameFlow: permissions.gameFlow,
    canChangeRoomSettings: permissions.roomSettings,
    onRevealCards: actions.reveal,
    onResetGame: actions.reset,
    onCardSelect: actions.selectCard,
    onToggleAutoComplete: actions.toggleAutoComplete,
    onCancelAutoReveal: actions.cancelAutoReveal,
    onOpenIssuesPanel: openIssues,
    onUpdateNoteContent: actions.updateNoteContent,
    // Demo never deletes, so don't even surface the confirm dialog there.
    onDeleteNote: isDemoMode ? undefined : requestDeleteNote,
  });

  // The node buffer between the derived layout and React Flow: the nodesRef
  // mirror, copy-in, and the debounced drag write-back live in the hook so the
  // drag path is unit-testable without mounting the canvas. Its handlers have
  // frozen identity, like everything else the node-builder memo depends on.
  const { nodes, nodesRef, onNodesChange: applyNodeChanges } =
    useNodeDragBuffer<CustomNodeType>({
      layoutNodes,
      onPositionSettled: actions.updateNodePosition,
    });

  // Update edges when the layout derivation changes (nodes copy-in is owned
  // by the drag buffer hook above).
  useEffect(() => {
    setEdges(layoutEdges);
  }, [layoutEdges, setEdges]);

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
            // Read the resolved remove decision directly — the same shape and
            // verdict the settings-panel roster uses — and let the confirmation
            // hook's gate refuse a denied removal.
            requestDeletePlayer(
              playerData.user._id,
              playerData.user.name,
              playerData.isCurrentUser,
              permissions.removeTarget(playerData.role),
            );
          }
          // Block all removals - deletions go through confirmation handlers
          return false;
        }
        return true;
      });

      // Apply locally; settled drags are written back (debounced) by the buffer.
      applyNodeChanges(filteredChanges);
    },
    [applyNodeChanges, nodesRef, requestDeleteNote, requestDeletePlayer, permissions]
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
            isIssuesPanelOpen={isIssuesPanelOpen}
            onIssuesPanelChange={(open) => (open ? openIssues() : closeAll())}
            isSettingsOpen={isSettingsOpen}
            onSettingsPanelChange={(open) => (open ? openSettings() : closeAll())}
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
        <CanvasDotsBackground />
      </ReactFlow>
      <NodePickerToolbar
        currentIssueId={currentIssue?._id ?? null}
        hasNoteForCurrentIssue={hasNoteForCurrentIssue}
        onCreateNote={() => currentIssue && actions.createNote(currentIssue._id)}
      />

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
      />

      {/* Issues Panel */}
      <IssuesPanel
        roomId={roomId}
        roomName={roomData.room.name}
        isOpen={isIssuesPanelOpen}
        onClose={closeAll}
        canManageIssues={permissions.issueManagement}
        canControlGameFlow={permissions.gameFlow}
      />
    </div>
  );
}

export function RoomCanvas(props: RoomCanvasProps): ReactElement {
  const isDemoMode = useIsDemoMode();
  const { roomData, currentUserId } = props;
  // One presence subscription per viewer: RoomPresenceProvider owns the single
  // usePresence instance for both consumers (nav avatars + settings roster).
  // It wraps RoomCanvasInner from out here — RoomCanvas does not re-render on
  // presence ticks, so the RoomCanvasInner element stays reference-identical
  // and a tick re-renders only the context consumers, never the ReactFlow
  // subtree (see room-presence.tsx). Mount it only when a consumer can exist:
  // in real rooms that needs a resolved currentUserId (matching
  // RoomCanvasInner's loading gate); in demo it subscribes to nothing anyway.
  const withPresence = roomData && (isDemoMode || currentUserId);
  return (
    <ReactFlowProvider>
      {withPresence ? (
        <RoomPresenceProvider
          roomId={roomData.room._id}
          userId={currentUserId ?? DEMO_VIEWER_ID}
          users={roomData.users}
        >
          <RoomCanvasInner {...props} />
        </RoomPresenceProvider>
      ) : (
        <RoomCanvasInner {...props} />
      )}
    </ReactFlowProvider>
  );
}
