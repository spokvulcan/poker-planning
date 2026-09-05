"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth/auth-provider";
import { CenteredMessage } from "@/components/centered-message";
import { Button } from "@/components/ui/button";
import { RetroJoinForm } from "@/components/retro/retro-join-form";
import { RetroBoard, type BoardViewer } from "@/components/retro/retro-board";
import { mergeCards, type BoardCard } from "@/components/retro/cards";
import { readinessOf } from "@/components/retro/readiness";
import { useCardActions } from "@/components/retro/use-card-actions";
import { useSingleFlightMutation } from "@/hooks/useSingleFlightMutation";
import { RetroMenu, type MyTeam } from "@/components/retro/retro-menu";
import type { RetroTeam } from "@/components/retro/retro-header";
import type { StageControls } from "@/components/retro/stage-nav";
import { currentStageOf } from "@/convex/model/retroFormats";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { BoardRead } from "@/convex/model/retro";
import { useRetroPermissions } from "@/hooks/usePermissions";
import { useRoomPresence, type UserWithPresence } from "@/hooks/useRoomPresence";
import { runAct } from "@/lib/run-act";
import {
  CHECKING_SESSION,
  JOIN_RETRO_BUTTON,
  LOADING_BOARD,
  LOADING_TITLE,
  STAGE_ACT_FAILED,
  readingAsTeamMember,
} from "@/convex/retroCopy";

/** What `api.users.getMyMembership` returns for a member. */
export type MyMembership = { _id: Id<"users"> };

interface RetroRoomContentProps {
  roomId: Id<"rooms">;
  roomData: RoomWithRelatedData;
  /** The visitor's membership: undefined while loading, null when none. */
  membership: MyMembership | null | undefined;
}

/**
 * The room page's retro branch (spec §18.1). Joining a retro is always a
 * deliberate act: nothing here auto-joins, whoever the visitor is. A
 * visitor with neither attendance nor Team access sees the join form, with
 * the join decision resolved first. A Team member who never joined reads
 * the board (ADR-0009) with a line offering to join, and no membership is
 * written until they take it. An attendee gets the board and its menu.
 */
export function RetroRoomContent({ roomId, roomData, membership }: RetroRoomContentProps) {
  const { isLoading: authLoading, isAuthenticated, accountType } = useAuth();
  const isMember = membership !== null && membership !== undefined;
  // Only a permanent account can hold a Team membership (ADR-0008), so an
  // anonymous visitor never opens the read.
  const isPermanent = accountType === "permanent";
  const myTeams = useQuery(api.teams.listMine, isPermanent ? {} : "skip");
  const [wantsToJoin, setWantsToJoin] = useState(false);

  const { room } = roomData;
  const team: RetroTeam | undefined =
    room.teamId && roomData.teamName ? { _id: room.teamId, name: roomData.teamName } : undefined;
  const isTeamMember = team !== undefined && (myTeams ?? []).some((t) => t._id === team._id);
  const canRead = isMember || isTeamMember;
  // The board read takes the reader guard; never subscribe before it passes.
  // `mine` is the attendee's own text (spec §9); a Team reader has none.
  const board = useQuery(api.retro.board, canRead ? { roomId } : "skip");
  const mine = useQuery(api.retro.mine, isMember ? { roomId } : "skip");
  const cards = useMemo<BoardCard[]>(
    () => (board ? mergeCards(board.cards, mine, membership?._id) : []),
    [board, mine, membership?._id]
  );
  // A Team reader never heartbeats, so their roster reads everyone offline.
  const offlineUsers = useMemo<UserWithPresence[]>(
    () => roomData.users.map((user) => ({ ...user, isOnline: false, lastSeen: null })),
    [roomData.users]
  );

  if (
    authLoading ||
    (isAuthenticated && membership === undefined) ||
    (isPermanent && myTeams === undefined)
  ) {
    return <CenteredMessage title={LOADING_TITLE} body={CHECKING_SESSION} />;
  }

  if (!isMember && (!isTeamMember || wantsToJoin)) {
    return (
      <RetroJoinForm
        roomId={roomId}
        roomName={room.name}
        joinPolicy={room.joinPolicy ?? "anyone"}
        isTeamMember={isTeamMember}
        teamName={roomData.teamName}
      />
    );
  }

  if (board === undefined) {
    return <CenteredMessage title={LOADING_TITLE} body={LOADING_BOARD} />;
  }

  if (!isMember && team) {
    return (
      <RetroBoard
        name={room.name}
        retro={board.retro}
        cards={cards}
        writers={board.writers}
        users={offlineUsers}
        team={team}
        banner={
          <div
            data-testid="team-reader-banner"
            className="flex flex-wrap items-center justify-between gap-2 border-b bg-blue-50 px-4 py-2 text-sm dark:bg-status-info-bg"
          >
            <span className="text-blue-800 dark:text-status-info-fg">
              {readingAsTeamMember(team.name)}
            </span>
            <Button size="sm" onClick={() => setWantsToJoin(true)}>
              {JOIN_RETRO_BUTTON}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <AttendeeBoard
      roomId={roomId}
      roomData={roomData}
      board={board}
      cards={cards}
      team={team}
      userId={membership!._id}
      myTeams={(myTeams ?? []) as MyTeam[]}
    />
  );
}

interface AttendeeBoardProps {
  roomId: Id<"rooms">;
  roomData: RoomWithRelatedData;
  board: BoardRead;
  cards: BoardCard[];
  team?: RetroTeam;
  userId: Id<"users">;
  myTeams: MyTeam[];
}

/**
 * The attendee's board: one presence subscription (heartbeat as this
 * member), the presence payload writes (readiness, the editing indicator)
 * through one global single-flight, the card writes, and the stageFlow
 * wiring. Its own component so the presence hook — which has no skip —
 * mounts only once a membership exists; a Team reader never heartbeats.
 */
function AttendeeBoard({ roomId, roomData, board, cards, team, userId, myTeams }: AttendeeBoardProps) {
  const { retro } = board;
  const users = useRoomPresence(roomId, userId, roomData.users);
  const setRetroPresence = useSingleFlightMutation(
    useMutation(api.presence.setRetroPresence),
    () => "presence"
  );
  const advance = useMutation(api.retro.advance);
  const setCardsVisible = useMutation(api.retro.setCardsVisible);
  const setTimebox = useMutation(api.retro.setTimebox);
  const { stageFlow, cardManagement, retroSettings } = useRetroPermissions(roomData, userId);
  const cardActions = useCardActions(roomId, userId);
  const currentStageId = currentStageOf(retro).id;
  // The payload is written whole, so an editing write carries readiness
  // too: the viewer's last toggle for this entry, else what their presence
  // row already says. An advance drops the local value with the entry.
  const me = users.find((u) => u._id === userId);
  const myPresence = me?.data;
  const [toggled, setToggled] = useState<{ stageId: string; ready: boolean } | null>(null);
  const writePresence = useCallback(
    (patch: { ready?: boolean; editing?: string }) => {
      const ready =
        patch.ready ??
        (toggled?.stageId === currentStageId ? toggled.ready : readinessOf(myPresence, currentStageId));
      if (patch.ready !== undefined) setToggled({ stageId: currentStageId, ready: patch.ready });
      void runAct(
        setRetroPresence({
          roomId,
          userId,
          stageId: currentStageId,
          ready,
          ...(patch.editing !== undefined ? { editing: patch.editing } : {}),
        }),
        STAGE_ACT_FAILED
      );
    },
    [setRetroPresence, roomId, userId, currentStageId, toggled, myPresence]
  );

  const controls = useMemo<StageControls>(
    () => ({
      stageFlow,
      onAdvance: (toStageId) => void runAct(advance({ roomId, toStageId }), STAGE_ACT_FAILED),
      onSetCardsVisible: (value) =>
        void runAct(setCardsVisible({ roomId, stageId: currentStageId, value }), STAGE_ACT_FAILED),
      onSetTimebox: (minutes) =>
        void runAct(
          setTimebox({ roomId, stageId: currentStageId, ...(minutes !== undefined ? { minutes } : {}) }),
          STAGE_ACT_FAILED
        ),
    }),
    [stageFlow, advance, setCardsVisible, setTimebox, roomId, currentStageId]
  );

  const viewer = useMemo<BoardViewer>(
    () => ({
      userId,
      name: me?.name ?? "",
      onSetReady: (ready) => writePresence({ ready }),
      onEditing: (clientId) => writePresence({ editing: clientId }),
      controls,
      cards: cardActions,
      cardManagement,
    }),
    [userId, me?.name, writePresence, controls, cardActions, cardManagement]
  );

  const role = roomData.users.find((u) => u._id === userId)?.role ?? "participant";
  return (
    <RetroBoard
      name={roomData.room.name}
      retro={retro}
      cards={cards}
      writers={board.writers}
      users={users}
      team={team}
      viewer={viewer}
      menu={
        <RetroMenu
          roomId={roomId}
          team={team}
          role={role}
          isOwnerAbsent={roomData.isOwnerAbsent}
          myTeams={myTeams}
          settings={{
            name: roomData.room.name,
            joinPolicy: roomData.room.joinPolicy ?? "anyone",
            retro,
            decision: retroSettings,
          }}
        />
      }
    />
  );
}
