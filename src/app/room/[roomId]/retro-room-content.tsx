"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth/auth-provider";
import { CenteredMessage } from "@/components/centered-message";
import { Button } from "@/components/ui/button";
import { RetroJoinForm } from "@/components/retro/retro-join-form";
import { RetroBoard, type BoardViewer } from "@/components/retro/retro-board";
import { RetroMenu, type MyTeam } from "@/components/retro/retro-menu";
import type { RetroTeam } from "@/components/retro/retro-header";
import type { StageControls } from "@/components/retro/stage-nav";
import { currentStageOf } from "@/convex/model/retroFormats";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
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
  const retro = useQuery(api.retro.board, canRead ? { roomId } : "skip");
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

  if (retro === undefined) {
    return <CenteredMessage title={LOADING_TITLE} body={LOADING_BOARD} />;
  }

  if (!isMember && team) {
    return (
      <RetroBoard
        name={room.name}
        retro={retro}
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
      retro={retro}
      team={team}
      userId={membership!._id}
      myTeams={(myTeams ?? []) as MyTeam[]}
    />
  );
}

interface AttendeeBoardProps {
  roomId: Id<"rooms">;
  roomData: RoomWithRelatedData;
  retro: Doc<"retros">;
  team?: RetroTeam;
  userId: Id<"users">;
  myTeams: MyTeam[];
}

/**
 * The attendee's board: one presence subscription (heartbeat as this
 * member), the readiness write, and the stageFlow wiring. Its own component
 * so the presence hook — which has no skip — mounts only once a membership
 * exists; a Team reader never heartbeats.
 */
function AttendeeBoard({ roomId, roomData, retro, team, userId, myTeams }: AttendeeBoardProps) {
  const users = useRoomPresence(roomId, userId, roomData.users);
  const setReadiness = useMutation(api.presence.setReadiness);
  const advance = useMutation(api.retro.advance);
  const setCardsVisible = useMutation(api.retro.setCardsVisible);
  const setTimebox = useMutation(api.retro.setTimebox);
  const { stageFlow, retroSettings } = useRetroPermissions(roomData, userId);
  const currentStageId = currentStageOf(retro).id;

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
      onSetReady: (ready) =>
        void runAct(setReadiness({ roomId, userId, stageId: currentStageId, ready }), STAGE_ACT_FAILED),
      controls,
    }),
    [userId, setReadiness, roomId, currentStageId, controls]
  );

  const role = roomData.users.find((u) => u._id === userId)?.role ?? "participant";
  return (
    <RetroBoard
      name={roomData.room.name}
      retro={retro}
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
