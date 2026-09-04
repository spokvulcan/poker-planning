"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { evaluateJoin, type JoinPolicy } from "@/convex/permissions";
import {
  JOIN_DENIED_PERMANENT,
  JOIN_FAILED,
  JOIN_NAME_LABEL,
  JOIN_NAME_PLACEHOLDER,
  JOIN_RETRO_BUTTON,
  JOIN_RETRO_TITLE,
  joinDeniedTeam,
} from "@/convex/retroCopy";

interface RetroJoinFormProps {
  roomId: Id<"rooms">;
  roomName: string;
  joinPolicy: JoinPolicy;
  isTeamMember: boolean;
  /** The owning Team's name, for the team-members-only copy. */
  teamName?: string;
}

/**
 * The retro join form (spec §4.4, §18.1): a name and nothing else. No
 * spectator toggle — a retro membership is never a spectator — and the join
 * decision runs here first, so a refused account sees why before it tries.
 */
export function RetroJoinForm({
  roomId,
  roomName,
  joinPolicy,
  isTeamMember,
  teamName,
}: RetroJoinFormProps) {
  const { authUserId, accountType } = useAuth();
  const joinRoom = useMutation(api.users.join);
  const [userName, setUserName] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const decision = evaluateJoin(joinPolicy, accountType ?? "anonymous", isTeamMember);
  const denial = decision.allowed
    ? null
    : decision.reason === "permanent-account-required"
      ? JOIN_DENIED_PERMANENT
      : joinDeniedTeam(teamName ?? "its team");

  const handleJoin = async () => {
    if (!userName.trim() || denial) return;
    setIsJoining(true);
    try {
      let currentAuthUserId = authUserId;
      if (!currentAuthUserId) {
        const result = await authClient.signIn.anonymous();
        if (result.error || !result.data?.user?.id) {
          toast.error(result.error?.message || "Failed to create session. Please try again.");
          return;
        }
        currentAuthUserId = result.data.user.id;
      }
      await joinRoom({ roomId, name: userName.trim(), authUserId: currentAuthUserId });
    } catch (error) {
      console.error("Failed to join retro:", error);
      toast.error(JOIN_FAILED);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-6">
        <div>
          <h2 className="text-2xl font-bold">{JOIN_RETRO_TITLE}</h2>
          <p className="text-muted-foreground">{roomName}</p>
        </div>

        <div className="space-y-4">
          <div className="grid w-full items-center gap-3">
            <Label htmlFor="name">{JOIN_NAME_LABEL}</Label>
            <Input
              id="name"
              placeholder={JOIN_NAME_PLACEHOLDER}
              autoComplete="name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
            />
          </div>

          {denial && (
            <p className="text-sm text-status-warning-fg" role="status">
              {denial}
            </p>
          )}

          <Button
            onClick={handleJoin}
            disabled={!userName.trim() || isJoining || denial !== null}
            className="text-md h-12 w-full"
            size="lg"
          >
            {JOIN_RETRO_BUTTON}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            By joining, you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
