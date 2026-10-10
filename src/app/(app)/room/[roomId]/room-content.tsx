"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ceremonyOf } from "@/convex/ceremony";
import { RoomCanvas } from "@/components/room/room-canvas";
import { JoinRoomDialog } from "@/components/room/join-room-dialog";
import { CenteredMessage } from "@/components/centered-message";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import { RetroCanvas } from "@/components/retro/retro-canvas";

/** What `api.users.getMyMembership` returns for a member. */
type MyMembership = { _id: Id<"users"> };

/**
 * `/room/[roomId]` serves both ceremonies. The two subscriptions anyone
 * opening a room needs (the room shell, their membership) open in one render;
 * who they are comes from the auth provider, which reads their users row.
 * Both ceremonies join the same way, and only the canvas differs: the poker
 * room or the retro whiteboard.
 */
export function RoomContent() {
  const params = useParams();
  const roomId = params.roomId as Id<"rooms">;
  const { isAuthenticated } = useAuth();

  // Room data query - currentUserId for vote unsanitization is derived server-side from auth context
  const roomData = useQuery(api.rooms.get, { roomId });
  // Query for existing membership in this room (derived server-side from auth)
  const existingMembership = useQuery(
    api.users.getMyMembership,
    isAuthenticated ? { roomId } : "skip"
  );

  if (roomData === undefined) {
    return <CenteredMessage title="Loading..." body="Fetching room data" />;
  }

  if (roomData === null) {
    return (
      <CenteredMessage
        title="Room Not Found"
        body="This room doesn't exist or has been deleted"
        action={
          <Button render={<Link href="/" />} nativeButton={false}>
            Back to home
          </Button>
        }
      />
    );
  }

  return (
    <JoinGate
      roomId={roomId}
      roomData={roomData}
      existingMembership={existingMembership}
    />
  );
}

/**
 * Joins the viewer (automatically when their users row has a name, else
 * through the join dialog), then shows the room's canvas. A viewer signed in
 * with no row yet has no name, and gets the dialog like a visitor.
 */
function JoinGate({
  roomId,
  roomData,
  existingMembership,
}: {
  roomId: Id<"rooms">;
  roomData: RoomWithRelatedData;
  existingMembership: MyMembership | null | undefined;
}) {
  const { viewer } = useAuth();
  // The name the viewer already goes by, to join under without asking
  const knownName = viewer.status === "signedIn" ? viewer.name : null;
  const joinRoom = useMutation(api.users.join);
  const [isAutoJoining, setIsAutoJoining] = useState(false);
  const autoJoinAttemptedRef = useRef(false);
  // Tracks whether the user has held a membership in this room during this
  // session, so we can tell "first/returning visit" apart from "was removed".
  const wasMemberRef = useRef(false);

  // User is in room if they have a membership in the database
  const isInRoom = existingMembership !== null && existingMembership !== undefined;

  // Once the user holds a membership, remember it. If it later disappears
  // (an owner removed them, or they left), they should land on the join dialog
  // rather than being silently auto-rejoined.
  useEffect(() => {
    if (isInRoom) wasMemberRef.current = true;
  }, [isInRoom]);

  // Auto-join callback
  const performAutoJoin = useCallback(async (name: string) => {
    setIsAutoJoining(true);
    try {
      await joinRoom({
        roomId,
        name,
      });
      // No need to set state - existingMembership query will auto-update
    } catch (error) {
      console.error("Auto-join failed:", error);
      toast.error("Failed to join room automatically");
      throw error;
    } finally {
      setIsAutoJoining(false);
    }
  }, [roomId, joinRoom]);

  // Auto-join if the viewer has a name but no membership in this room
  useEffect(() => {
    const shouldAutoJoin =
      !autoJoinAttemptedRef.current &&
      !wasMemberRef.current && // don't re-add a user who was removed / left
      knownName &&
      existingMembership === null; // No membership in this room (query returned null, not undefined)

    if (shouldAutoJoin) {
      autoJoinAttemptedRef.current = true;
      performAutoJoin(knownName).catch(() => {
        autoJoinAttemptedRef.current = false;
      });
    }
  }, [knownName, existingMembership, performAutoJoin]);

  // Show loading while auto-joining
  if (isAutoJoining) {
    return <CenteredMessage title="Joining room..." body="Please wait" />;
  }

  // Wait until the auth provider knows who the viewer is before deciding what to show
  if (viewer.status === "loading") {
    return <CenteredMessage title="Loading..." body="Checking session" />;
  }

  const { roomType } = roomData.room;

  // A visitor gets the JoinRoomDialog (the session is created on join)
  if (viewer.status === "visitor") {
    return <JoinRoomDialog roomId={roomId} roomName={roomData.room.name} roomType={roomType} />;
  }

  // Signed in: wait for the membership query to load
  if (existingMembership === undefined) {
    return <CenteredMessage title="Loading..." body="Checking membership" />;
  }

  // If user has membership, show the room canvas
  if (isInRoom) {
    return ceremonyOf(roomData.room) === "retro" ? (
      <RetroCanvas roomData={roomData} currentUserId={existingMembership._id} />
    ) : (
      <RoomCanvas roomData={roomData} currentUserId={existingMembership._id} />
    );
  }

  // No membership - show join dialog (auto-join may be in progress if the viewer has a name)
  return <JoinRoomDialog roomId={roomId} roomName={roomData.room.name} roomType={roomType} />;
}
