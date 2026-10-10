"use client";

import { ReactElement, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { NodeTypes } from "@xyflow/react";

import { CanvasNavigation } from "./canvas-navigation";
import { RoomSettingsPanel } from "./room-settings-panel";
import { IssuesPanel } from "./issues-panel";
import { DemoExplainer } from "./demo-explainer";
import { useDemoSimulation, useIsDemoMode } from "./demo/DemoSimulationProvider";
import { buildCanvasEdges, buildCanvasNodes, isNoteForIssue } from "./hooks/buildCanvasNodes";
import { useCanvasActions } from "./hooks/useCanvasActions";
import { usePanelState } from "./hooks/usePanelState";
import { NodePickerToolbar } from "./node-picker-toolbar";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  NoteNode,
  PlayerNode,
  ResultsNode,
  SessionNode,
  TimerNode,
  VotingCardNode,
} from "./nodes";
import { DEMO_VIEWER_ID, type CustomNodeType, type PokerBoardActions } from "./types";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import { phaseOf } from "@/convex/phase";
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

/** A player a Delete will remove once the viewer confirms. */
interface PendingPlayer {
  id: Id<"users">;
  name: string;
}

const NO_PLAYERS: PendingPlayer[] = [];

// "Ada, Bob, and Cy", for a dialog that names everyone it will remove.
const playerNames = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * The poker room's adapter onto the whiteboard, shaped like the retro's: room
 * data and the viewer in, the board's nodes and what its gestures mean out.
 * The nodes read one frozen actions object and the viewer's permissions. A
 * drop is a move; Delete, like a note's ✕, asks first before a note with words
 * in it goes, and asks once about every player it would remove. Around the
 * board: its chrome, toolbar and panels.
 */
function RoomCanvasInner({ roomData, currentUserId, isEmbedded = false }: RoomCanvasProps): ReactElement {
  const roomId = roomData.room._id;

  // In the Demo simulation the board's nodes and current issue come from
  // context, never from Convex (zero reads, ADR-0003); `"skip"` keeps the
  // query calls unconditional. The demo signal is derived from the same
  // context (#214), so the two can never disagree.
  const demo = useDemoSimulation();
  const isDemoMode = !!demo;
  const canvasNodesQuery = useQuery(api.canvas.getCanvasNodes, demo ? "skip" : { roomId });
  const currentIssueQuery = useQuery(api.issues.getCurrent, demo ? "skip" : { roomId });
  const canvasNodes = demo ? demo.canvasNodes : canvasNodesQuery;

  // Only the issue's id and title reach the nodes, so the board rebuilds when
  // they change and not on every other write to the issue.
  const currentIssueId = demo ? demo.currentIssue._id : currentIssueQuery?._id;
  const currentIssueTitle = demo ? demo.currentIssue.title : currentIssueQuery?.title;
  const currentIssue = useMemo(
    () => (currentIssueId ? { _id: currentIssueId, title: currentIssueTitle ?? "" } : null),
    [currentIssueId, currentIssueTitle],
  );

  const permissions = usePokerPermissions(roomData, currentUserId);

  // Every backend write the board makes, frozen. Under /demo each one no-ops.
  // A card pick lands on `roomData` at once, which raises the card.
  const writes = useCanvasActions({ roomId, currentUserId });

  // Docked-panel state: mutual exclusion + Escape-to-close.
  const { isIssuesPanelOpen, isSettingsOpen, openIssues, openSettings, closeAll } =
    usePanelState();

  // What Delete is waiting on the viewer to confirm.
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [pendingPlayers, setPendingPlayers] = useState<PendingPlayer[]>(NO_PLAYERS);

  // The board's own Delete for a note, frozen: an empty note goes at once.
  const { deleteNote } = useStableActions({
    deleteNote: (nodeId: string) => {
      const note = canvasNodes?.find((node) => node.nodeId === nodeId);
      if (note?.type === "note" && note.data.content) setPendingNote(nodeId);
      else writes.deleteNote(nodeId);
    },
  });

  // Everything a node can ask for, built once from handlers that keep their
  // identity (the canvas writes, opening the issues, the Delete above): node
  // data never churns on a handler.
  const [actions] = useState<PokerBoardActions>(() => ({
    reveal: writes.reveal,
    reset: writes.reset,
    toggleAutoComplete: writes.toggleAutoComplete,
    cancelAutoReveal: writes.cancelAutoReveal,
    selectCard: writes.selectCard,
    updateNoteContent: writes.updateNoteContent,
    openIssues,
    deleteNote,
  }));

  // What the board's gestures mean here, a Delete's confirmation included,
  // frozen like the node actions.
  const gestures = useStableActions({
    onDrop: ({ nodes: moved }: WhiteboardDrop<CustomNodeType>) =>
      writes.moveNodes(moved.map((node) => ({ nodeId: node.id, position: node.position }))),
    // Delete takes a note off as its ✕ does, and asks once about every player
    // the viewer may remove, never themselves. Nothing else on this board can
    // be deleted.
    onDeleteNodes: (doomed: CustomNodeType[]) => {
      const players: PendingPlayer[] = [];
      for (const node of doomed) {
        if (node.type === "note") {
          actions.deleteNote(node.id);
        } else if (
          node.type === "player" &&
          !node.data.isCurrentUser &&
          permissions.removeTarget(node.data.role).allowed
        ) {
          players.push({ id: node.data.user._id, name: node.data.user.name });
        }
      }
      if (players.length > 0) setPendingPlayers(players);
    },
    // State updaters must stay pure, so the write goes out here and then the
    // pending value clears.
    confirmNote: () => {
      if (pendingNote) writes.deleteNote(pendingNote);
      setPendingNote(null);
    },
    confirmPlayers: () => {
      for (const player of pendingPlayers) writes.removeUser(player.id);
      setPendingPlayers(NO_PLAYERS);
    },
    dismissNote: () => setPendingNote(null),
    dismissPlayers: () => setPendingPlayers(NO_PLAYERS),
  });

  // The ONE client-side phase derivation (#227): node data and edges branch
  // on it, never on the raw `isGameOver` / countdown fields.
  const phase = phaseOf(roomData.room);

  const nodes = useMemo(() => {
    if (!canvasNodes) return [];
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
      isDemoMode,
      permissions,
      actions,
    });
  }, [canvasNodes, roomData, phase, roomId, currentIssue, currentUserId, isDemoMode, permissions, actions]);

  // The edges read a strict subset of what the nodes do (the phase, the
  // members, the canvas nodes and the issue's id), so a card pick or a renamed
  // issue rebuilds the nodes, never the edges.
  const users = roomData.users;
  const edges = useMemo(() => {
    if (!canvasNodes) return [];
    return buildCanvasEdges({
      phase,
      members: users,
      canvasNodes,
      currentIssue: currentIssueId ? { _id: currentIssueId } : null,
    });
  }, [canvasNodes, users, phase, currentIssueId]);

  const hasNoteForCurrentIssue = !!canvasNodes?.some((node) => isNoteForIssue(node, currentIssueId));

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
      onDrop={gestures.onDrop}
      onDeleteNodes={gestures.onDeleteNodes}
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
            onCreateNote={() => currentIssue && writes.createNote(currentIssue._id)}
          />

          {/* Demo explainer - only shown in demo mode, not when embedded */}
          {isDemoMode && !isEmbedded && <DemoExplainer />}

          {/* Delete note confirmation dialog */}
          <AlertDialog open={!!pendingNote} onOpenChange={(open) => !open && gestures.dismissNote()}>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete note?</AlertDialogTitle>
                <AlertDialogDescription>
                  This note has content. Are you sure you want to delete it?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={gestures.confirmNote}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Remove users confirmation dialog */}
          <AlertDialog open={pendingPlayers.length > 0} onOpenChange={(open) => !open && gestures.dismissPlayers()}>
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
                <AlertDialogAction variant="destructive" onClick={gestures.confirmPlayers}>
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
