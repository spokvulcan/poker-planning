"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth/auth-provider";
import { CenteredMessage } from "@/components/centered-message";
import { RetroJoinForm } from "@/components/retro/retro-join-form";
import { RetroBoard } from "@/components/retro/retro-board";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import { CHECKING_SESSION, LOADING_BOARD, LOADING_TITLE } from "@/convex/retroCopy";

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
 * deliberate act: nothing here auto-joins, whoever the visitor is. Without a
 * membership the retro join form shows, with the join decision resolved
 * first; with one, the board mounts.
 */
export function RetroRoomContent({ roomId, roomData, membership }: RetroRoomContentProps) {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const isMember = membership !== null && membership !== undefined;
  // The board read takes the reader guard; never subscribe before it passes.
  const retro = useQuery(api.retro.board, isMember ? { roomId } : "skip");

  const { room } = roomData;

  if (authLoading || (isAuthenticated && membership === undefined)) {
    return <CenteredMessage title={LOADING_TITLE} body={CHECKING_SESSION} />;
  }

  if (!isMember) {
    return (
      <RetroJoinForm
        roomId={roomId}
        roomName={room.name}
        joinPolicy={room.joinPolicy ?? "anyone"}
        // Team membership reaches the client with team retros (#289); a
        // teamless retro has no Team to be a member of.
        isTeamMember={false}
      />
    );
  }

  if (retro === undefined) {
    return <CenteredMessage title={LOADING_TITLE} body={LOADING_BOARD} />;
  }

  return <RetroBoard name={room.name} retro={retro} />;
}
