"use client";

import { ReactElement, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { NodeTypes } from "@xyflow/react";
import { ListTodo, Settings } from "lucide-react";

import { BoardChrome, type BoardChromeHandle, type ChromeBoard, type ChromePanel } from "./board-chrome";
import { RoomSettingsPanel } from "./room-settings-panel";
import { IssuesPanel } from "./issues-panel";
import { DemoExplainer } from "./demo-explainer";
import { useDemoSimulation, useIsDemoMode } from "./demo/DemoSimulationProvider";
import { buildCanvasEdges, buildCanvasNodes, isNoteForIssue, timeNodesShown } from "./hooks/buildCanvasNodes";
import { useCanvasActions } from "./hooks/useCanvasActions";
import { useRoundClockActions } from "./hooks/useRoundClockActions";
import { toast } from "@/lib/toast";
import { NodePickerToolbar } from "./node-picker-toolbar";
import { UserMenu } from "@/components/user-menu";
import { useSeatControls } from "./seat-controls";
import { ShinyButton } from "@/components/ui/shiny-button";
import { rulesOf } from "@/convex/ceremony";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  NoteNode,
  PlayerNode,
  ResultsNode,
  RoundTimerNode,
  SessionNode,
  SessionTimeNode,
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
  roundTimer: RoundTimerNode,
  sessionTime: SessionTimeNode,
} as const;

/** A player a Delete will remove once the viewer confirms. */
interface PendingPlayer {
  id: Id<"users">;
  name: string;
}

const NO_PLAYERS: PendingPlayer[] = [];

// "Ada, Bob, and Cy", for a dialog that names everyone it will remove.
const playerNames = new Intl.ListFormat("en", { type: "conjunction" });

/** The panel the session node's issue button opens. */
const ISSUES_PANEL = "issues";

/** What the demo shows where the account menu goes: the way into a room of one's own. */
function CreateRoomButton(): ReactElement {
  const router = useRouter();
  return <ShinyButton onClick={() => router.push("/room/new")}>Create Your Room</ShinyButton>;
}

/**
 * The poker room's adapter onto the whiteboard, shaped like the retro's: room
 * data and the viewer in, the board's nodes and what its gestures mean out.
 * The nodes read one frozen actions object and the viewer's permissions. A
 * drop is a move; Delete, like a note's ✕, asks first before a note with words
 * in it goes, and asks once about every player it would remove. Around the
 * board: its chrome, with the issues and the settings docked, and over it the
 * toolbar.
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
  const canvasNodes = demo ? demo.canvasNodes : canvasNodesQuery;

  // The issue the round is on: the room's row names it, and the board reads
  // that one issue rather than the room again, so a vote, which patches the
  // room's row, re-runs no query here. A newly named issue's title follows
  // its id by a round trip; one that is gone (null) is no issue at all.
  const namedIssueId = demo ? undefined : roomData.room.currentIssueId;
  const namedIssue = useQuery(api.issues.get, namedIssueId ? { roomId, issueId: namedIssueId } : "skip");

  // Only the issue's id and title reach the nodes, so the board rebuilds when
  // they change and not on every other write to the issue.
  const currentIssueId = demo ? demo.currentIssue._id : namedIssue === null ? undefined : namedIssueId;
  const currentIssueTitle = demo ? demo.currentIssue.title : namedIssue?.title;
  const currentIssue = useMemo(
    () => (currentIssueId ? { _id: currentIssueId, title: currentIssueTitle ?? "" } : null),
    [currentIssueId, currentIssueTitle],
  );

  const permissions = usePokerPermissions(roomData, currentUserId);

  // Every backend write the board makes, frozen. Under /demo each one no-ops.
  // A card pick lands on `roomData` at once, which raises the card.
  const writes = useCanvasActions({ roomId, currentUserId });
  const clockWrites = useRoundClockActions({ roomId, currentUserId });

  // The chrome, for a node to open a panel through.
  const chrome = useRef<BoardChromeHandle>(null);

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
    ...clockWrites,
    openIssues: () => chrome.current?.openPanel(ISSUES_PANEL),
    deleteNote,
  }));

  // What the board's gestures mean here, a Delete's confirmation included,
  // frozen like the node actions.
  const gestures = useStableActions({
    onDrop: ({ nodes: moved }: WhiteboardDrop<CustomNodeType>) =>
      writes.moveNodes(moved.map((node) => ({ nodeId: node.id, position: node.position }))),
    // Delete takes a note off as its ✕ does, hides a time node for the room
    // when its settings allow (the clock keeps running), and asks once about
    // every player the viewer may remove, never themselves. Nothing else on
    // this board can be deleted.
    onDeleteNodes: (doomed: CustomNodeType[]) => {
      const players: PendingPlayer[] = [];
      for (const node of doomed) {
        if (node.type === "note") {
          actions.deleteNote(node.id);
        } else if ((node.type === "roundTimer" || node.type === "sessionTime") && permissions.roomSettings.allowed) {
          actions.setTimeNodeShown(node.type === "roundTimer" ? "timer" : "sessionTime", false);
          toast(node.type === "roundTimer" ? "Timer hidden" : "Session time hidden", {
            description: "Right-click the session node to show it again. Time is tracked either way.",
          });
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
        lastActivityAt: room.lastActivityAt,
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

  // What the chrome shows of the board. The demo is the one board that isn't
  // a room: its link is the demo's own, it says so beside its name, and where
  // the account menu goes it offers a room of one's own.
  const roomName = roomData.room.name;
  const noun = rulesOf(roomData.room).noun;
  const board: ChromeBoard = isDemoMode
    ? { name: roomName, link: "/demo", noun: "Demo", tag: "Demo" }
    : { name: roomName, link: `/room/${roomId}`, noun };
  // The viewer's seat, from the roster the room already holds, for the account menu.
  const seat = useSeatControls({
    roomId,
    room: roomData.room,
    me: roomData.users.find((user) => user._id === currentUserId),
  });
  const account = isDemoMode ? <CreateRoomButton /> : <UserMenu seat={seat?.items} />;

  // The panels docked beside the board, drawn from the room as it is now.
  const panels: ChromePanel[] = [
    {
      id: ISSUES_PANEL,
      label: "Issues",
      icon: ListTodo,
      render: (close) => (
        <IssuesPanel
          roomId={roomId}
          roomName={roomName}
          currentIssueId={currentIssueId}
          onClose={close}
          canManageIssues={permissions.issueManagement}
          canControlGameFlow={permissions.gameFlow}
        />
      ),
    },
    {
      id: "settings",
      label: `${noun} settings`,
      icon: Settings,
      testId: "room-settings-panel",
      render: (close) => (
        <RoomSettingsPanel
          roomData={roomData}
          currentUserId={currentUserId}
          onClose={close}
          timeNodes={timeNodesShown(canvasNodes ?? [])}
          onSetTimeNodeShown={actions.setTimeNodeShown}
        />
      ),
    },
  ];

  return (
    <BoardChrome ref={chrome} board={board} panels={panels} account={account} bars={!isEmbedded}>
      <Whiteboard
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        readOnly={isDemoMode}
        onDrop={gestures.onDrop}
        onDeleteNodes={gestures.onDeleteNodes}
        fitKey={fitKey}
        className="bg-transparent"
        overlay={
          <>
            <NodePickerToolbar
              currentIssueId={currentIssue?._id ?? null}
              hasNoteForCurrentIssue={hasNoteForCurrentIssue}
              onCreateNote={() => currentIssue && writes.createNote(currentIssue._id)}
            />

            {/* Demo explainer - only shown in demo mode, not when embedded */}
            {isDemoMode && !isEmbedded && <DemoExplainer />}

            {/* Leaving the room, confirmed outside the account menu */}
            {seat?.dialog}

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
      />
    </BoardChrome>
  );
}

/**
 * The poker board, for a member of the room or for the demo's viewer: one
 * presence subscription per viewer (the demo's is local), around the board
 * and its chrome.
 */
export function RoomCanvas(props: RoomCanvasProps): ReactElement {
  const isDemoMode = useIsDemoMode();
  const { roomData, currentUserId } = props;
  // The room page mounts the board once the viewer has joined; until someone
  // sits at it there is nothing to draw, and no presence to hold.
  if (!currentUserId && !isDemoMode) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }
  return (
    <WhiteboardProviders
      presence={{ roomId: roomData.room._id, userId: currentUserId ?? DEMO_VIEWER_ID, users: roomData.users }}
    >
      <RoomCanvasInner {...props} />
    </WhiteboardProviders>
  );
}
