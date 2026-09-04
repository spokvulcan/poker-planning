"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth/auth-provider";
import { RetroJoinForm } from "@/components/retro/retro-join-form";
import { RetroBoard } from "@/components/retro/retro-board";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import { LOADING_BOARD } from "@/convex/retroCopy";

interface RetroRoomContentProps {
  roomId: Id<"rooms">;
  roomData: RoomWithRelatedData;
}

function Centered({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold">{title}</h2>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/**
 * The room page's retro branch (spec §18.1). Joining a retro is always a
 * deliberate act: nothing here auto-joins, whoever the visitor is. Without a
 * membership the retro join form shows, with the join decision resolved
 * first; with one, the board mounts.
 */
export function RetroRoomContent({ roomId, roomData }: RetroRoomContentProps) {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const membership = useQuery(api.users.getMyMembership, isAuthenticated ? { roomId } : "skip");
  const isMember = membership !== null && membership !== undefined;
  // The board read takes the reader guard; never subscribe before it passes.
  const retro = useQuery(api.retro.board, isMember ? { roomId } : "skip");

  const { room } = roomData;

  if (authLoading || (isAuthenticated && membership === undefined)) {
    return <Centered title="Loading..." body="Checking session" />;
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
    return <Centered title="Loading..." body={LOADING_BOARD} />;
  }

  return <RetroBoard room={room} retro={retro} />;
}
