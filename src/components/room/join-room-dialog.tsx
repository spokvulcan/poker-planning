"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { rulesOf } from "@/convex/ceremony";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { SESSION_FAILED, useEnsureSession } from "@/hooks/useEnsureSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";

interface JoinRoomDialogProps {
  roomId: Id<"rooms">;
  roomName: string;
  roomType?: Doc<"rooms">["roomType"];
}

export function JoinRoomDialog({ roomId, roomName, roomType }: JoinRoomDialogProps) {
  // A retro has no spectators: everyone at the board writes.
  const { noun, spectators: allowSpectator } = rulesOf({ roomType });
  const ensureSession = useEnsureSession();
  const joinRoom = useMutation(api.users.join);

  // Start with empty name for first-time users
  const [userName, setUserName] = useState("");
  const [isSpectator, setIsSpectator] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async () => {
    if (!userName.trim()) {
      toast.error("Please enter your name");
      return;
    }

    setIsJoining(true);
    try {
      // A guest session Convex already has. The join writes the user row
      // with the typed name, so the session doesn't write one first.
      let authUserId: string;
      try {
        authUserId = await ensureSession({ createUser: false });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : SESSION_FAILED);
        return;
      }

      await joinRoom({
        roomId,
        name: userName,
        isSpectator,
        authUserId,
      });

      // No need to set state - existingMembership query will auto-update
      // and room-content.tsx will re-render with the new membership
    } catch (error) {
      console.error("Failed to join room:", error);
      toast.error(`Failed to join ${noun.toLowerCase()}`);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 bg-card p-6 rounded-lg border">
        <div>
          <h2 className="text-2xl font-bold">Join {noun}</h2>
          <p className="text-muted-foreground">{roomName}</p>
        </div>

        <div className="space-y-4">
          <div className="grid w-full max-w-sm items-center gap-3">
            <Label htmlFor="name">Your Name</Label>
            <Input
              id="name"
              placeholder="Enter your name"
              autoComplete="name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
            />
          </div>

          {allowSpectator && (
            <div className="flex items-center space-x-2">
              <Switch
                id="spectator"
                checked={isSpectator}
                onCheckedChange={setIsSpectator}
              />
              <Label htmlFor="spectator">Join as spectator</Label>
            </div>
          )}

          <Button
            onClick={handleJoin}
            disabled={!userName.trim() || isJoining}
            className="w-full h-12 text-md"
            size="lg"
          >
            Join {noun}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            By joining, you agree to our{" "}
            <Link
              href="/terms"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
