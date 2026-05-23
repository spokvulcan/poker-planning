"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RoomCanvas } from "@/components/room/room-canvas";
import { JoinRoomDialog } from "@/components/room/join-room-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";

export function RoomContent() {
  const params = useParams();
  const roomId = params.roomId as Id<"rooms">;
  const { authUserId, isLoading: authLoading, isAuthenticated } = useAuth();
  const joinRoom = useMutation(api.users.join);
  const [isAutoJoining, setIsAutoJoining] = useState(false);
  const autoJoinAttemptedRef = useRef(false);
  // Tracks whether the user has held a membership in this room during this
  // session, so we can tell "first/returning visit" apart from "was removed".
  const wasMemberRef = useRef(false);

  // Query for existing membership in this room (derived server-side from auth)
  const existingMembership = useQuery(
    api.users.getMyMembership,
    isAuthenticated ? { roomId } : "skip"
  );

  // Query for global user (to check if they've joined any room before)
  const globalUser = useQuery(
    api.users.getGlobalUser,
    isAuthenticated ? {} : "skip"
  );

  // Room data query - currentUserId for vote unsanitization is derived server-side from auth context
  const roomData = useQuery(api.rooms.get, { roomId });

  // User is in room if they have a membership in the database
  const isInRoom = existingMembership !== null && existingMembership !== undefined;

  // Once the user holds a membership, remember it. If it later disappears
  // (an owner removed them, or they left), they should land on the join dialog
  // rather than being silently auto-rejoined.
  useEffect(() => {
    if (isInRoom) wasMemberRef.current = true;
  }, [isInRoom]);

  // Auto-join callback
  const performAutoJoin = useCallback(async () => {
    if (!globalUser || !authUserId) return;

    setIsAutoJoining(true);
    try {
      await joinRoom({
        roomId,
        name: globalUser.name,
        authUserId,
      });
      // No need to set state - existingMembership query will auto-update
    } catch (error) {
      console.error("Auto-join failed:", error);
      toast.error("Failed to join room automatically");
      throw error;
    } finally {
      setIsAutoJoining(false);
    }
  }, [globalUser, authUserId, roomId, joinRoom]);

  // Auto-join if global user exists but no membership in this room
  useEffect(() => {
    const shouldAutoJoin =
      !autoJoinAttemptedRef.current &&
      !wasMemberRef.current && // don't re-add a user who was removed / left
      roomData?.room &&
      globalUser &&
      existingMembership === null && // No membership in this room (query returned null, not undefined)
      authUserId;

    if (shouldAutoJoin) {
      autoJoinAttemptedRef.current = true;
      performAutoJoin().catch(() => {
        autoJoinAttemptedRef.current = false;
      });
    }
  }, [roomData, globalUser, existingMembership, authUserId, performAutoJoin]);

  if (!roomData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Fetching room data</p>
        </div>
      </div>
    );
  }

  if (!roomData.room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Room Not Found</h2>
          <p className="text-muted-foreground">This room doesn&apos;t exist or has been deleted</p>
        </div>
      </div>
    );
  }

  // Show loading while auto-joining
  if (isAutoJoining) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Joining room...</h2>
          <p className="text-muted-foreground">Please wait</p>
        </div>
      </div>
    );
  }

  // Wait for auth state to be determined before deciding what to show
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Checking session</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show JoinRoomDialog (session will be created on join)
  if (!isAuthenticated) {
    return <JoinRoomDialog roomId={roomId} roomName={roomData.room.name} />;
  }

  // If authenticated, wait for queries to load
  const queriesLoaded = existingMembership !== undefined && globalUser !== undefined;

  if (!queriesLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Checking membership</p>
        </div>
      </div>
    );
  }

  // If user has membership, show the room canvas
  if (isInRoom) {
    return <RoomCanvas roomData={roomData} currentUserId={existingMembership._id} />;
  }

  // No membership - show join dialog (auto-join may be in progress if globalUser exists)
  return <JoinRoomDialog roomId={roomId} roomName={roomData.room.name} />;
}
