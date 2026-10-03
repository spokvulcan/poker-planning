"use client";

import { ReactElement, useMemo } from "react";
import type { NodeTypes } from "@xyflow/react";

import { CanvasNavigation } from "./canvas-navigation";
import { RoomSettingsPanel } from "./room-settings-panel";
import { IssuesPanel } from "./issues-panel";
import { DemoExplainer } from "./demo-explainer";
import { useIsDemoMode } from "./demo/DemoSimulationProvider";
import { useCanvasNodes } from "./hooks/useCanvasNodes";
import { useCanvasActions } from "./hooks/useCanvasActions";
import { useCardSelection } from "./hooks/useCardSelection";
import { usePanelState } from "./hooks/usePanelState";
import { useDeleteConfirmation, type PlayerRemovalRequest } from "./hooks/useDeleteConfirmation";
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
import { useStableActions } from "@/hooks/useStableActions";
import { Whiteboard, WhiteboardProviders, type WhiteboardDrop } from "@/components/whiteboard/whiteboard";
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

// "Ada, Bob, and Cy", for a dialog that names everyone it will remove.
const playerNames = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * The poker room's adapter onto the whiteboard: its nodes, what a drop and a
 * Delete mean here (a move, and a confirmation before a note or a player
 * goes), and its chrome and panels.
 */
function RoomCanvasInner({ roomData, currentUserId, isEmbedded = false }: RoomCanvasProps): ReactElement {
  // The demo signal is derived once from the provider seam (#214), matching how
  // the children and hooks below now obtain it; the demo route mounts the
  // provider and is the sole place that decides demo-vs-real.
  const isDemoMode = useIsDemoMode();

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
    pendingPlayers,
    requestDeleteNote,
    requestRemovePlayers,
    confirmNote,
    confirmPlayers,
    dismissNote,
    dismissPlayers,
  } = useDeleteConfirmation({
    deleteNote: actions.deleteNote,
    removeUser: actions.removeUser,
  });

  // Use the canvas nodes hook to get persisted nodes. Every node-embedded
  // handler below has a frozen identity, so the node-builder memo never churns.
  const { nodes, edges, currentIssue, hasNoteForCurrentIssue } = useCanvasNodes({
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

  const board = useStableActions({
    onDrop: ({ nodes: moved }: WhiteboardDrop<CustomNodeType>) =>
      actions.moveNodes(moved.map((node) => ({ nodeId: node.id, position: node.position }))),
    // Delete goes through a confirmation: a note with words in it, and the
    // players the viewer may remove, all of them in one dialog. Nothing else on
    // this board can be deleted.
    onDeleteNodes: (doomed: CustomNodeType[]) => {
      const players: PlayerRemovalRequest[] = [];
      for (const node of doomed) {
        if (node.type === "note") {
          requestDeleteNote(node.id, !!node.data.content);
        } else if (node.type === "player") {
          const player = node.data as PlayerNodeData;
          players.push({
            id: player.user._id,
            name: player.user.name,
            isSelf: player.isCurrentUser,
            removeDecision: permissions.removeTarget(player.role),
          });
        }
      }
      requestRemovePlayers(players);
    },
  });

  // The board refits when someone joins or leaves, not on every vote.
  const fitKey = useMemo(
    () => roomData.users.map((user) => user._id).sort().join(","),
    [roomData.users],
  );

  if (!roomData || (!currentUserId && !isDemoMode)) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );
  }

  return (
    <Whiteboard
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      readOnly={isDemoMode}
      onDrop={board.onDrop}
      onDeleteNodes={board.onDeleteNodes}
      fitKey={fitKey}
      className="bg-transparent"
      navigation={
        (isDemoMode || currentUserId) && !(isDemoMode && isEmbedded) ? (
          <CanvasNavigation
            roomData={roomData}
            isIssuesPanelOpen={isIssuesPanelOpen}
            onIssuesPanelChange={(open) => (open ? openIssues() : closeAll())}
            isSettingsOpen={isSettingsOpen}
            onSettingsPanelChange={(open) => (open ? openSettings() : closeAll())}
          />
        ) : null
      }
      overlay={
        <>
          <NodePickerToolbar
            currentIssueId={currentIssue?._id ?? null}
            hasNoteForCurrentIssue={hasNoteForCurrentIssue}
            onCreateNote={() => currentIssue && actions.createNote(currentIssue._id)}
          />

          {/* Demo explainer - only shown in demo mode, not when embedded */}
          {isDemoMode && !isEmbedded && <DemoExplainer />}

          {/* Delete note confirmation dialog */}
          <AlertDialog open={!!pendingNote} onOpenChange={(open) => !open && dismissNote()}>
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

          {/* Remove users confirmation dialog */}
          <AlertDialog open={pendingPlayers.length > 0} onOpenChange={(open) => !open && dismissPlayers()}>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pendingPlayers.length === 1
                    ? `Remove ${pendingPlayers[0].name}?`
                    : `Remove ${pendingPlayers.length} players?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingPlayers.length === 1
                    ? "This will remove the user from the room. They can rejoin using the room link."
                    : `This will remove ${playerNames.format(pendingPlayers.map((player) => player.name))} from the room. They can rejoin using the room link.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={confirmPlayers}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
      panels={
        <>
          <RoomSettingsPanel
            roomData={roomData}
            currentUserId={isDemoMode ? undefined : (currentUserId as Id<"users">)}
            isOpen={isSettingsOpen}
            onClose={closeAll}
          />
          <IssuesPanel
            roomId={roomId}
            roomName={roomData.room.name}
            isOpen={isIssuesPanelOpen}
            onClose={closeAll}
            canManageIssues={permissions.issueManagement}
            canControlGameFlow={permissions.gameFlow}
          />
        </>
      }
    />
  );
}

export function RoomCanvas(props: RoomCanvasProps): ReactElement {
  const isDemoMode = useIsDemoMode();
  const { roomData, currentUserId } = props;
  // One presence subscription per viewer, mounted only when a consumer can
  // exist: in real rooms that needs a resolved currentUserId (matching
  // RoomCanvasInner's loading gate); in demo it subscribes to nothing anyway.
  const withPresence = roomData && (isDemoMode || currentUserId);
  return (
    <WhiteboardProviders
      presence={
        withPresence
          ? { roomId: roomData.room._id, userId: currentUserId ?? DEMO_VIEWER_ID, users: roomData.users }
          : undefined
      }
    >
      <RoomCanvasInner {...props} />
    </WhiteboardProviders>
  );
}
