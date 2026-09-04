"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { SIGN_IN_TO_CREATE } from "@/convex/model/teams";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

interface NewTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the sign-in link returns to for an anonymous account. */
  returnTo: string;
}

/**
 * "New team" (spec §5): a permanent account names a Team and becomes its
 * admin; an anonymous account is told to sign in first. The server enforces
 * the same rule, so this dialog only shapes the copy.
 */
export function NewTeamDialog({ open, onOpenChange, returnTo }: NewTeamDialogProps) {
  const router = useRouter();
  const { accountType } = useAuth();
  const createTeam = useMutation(api.teams.create);
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const isPermanent = accountType === "permanent";

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsCreating(true);
    try {
      const teamId = await createTeam({ name: trimmed });
      onOpenChange(false);
      setName("");
      router.push(`/team/${teamId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create team");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
          <DialogDescription>
            A team keeps its retros and decides who can read them later.
          </DialogDescription>
        </DialogHeader>
        {isPermanent ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
            className="space-y-4"
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              maxLength={100}
              aria-label="Team name"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || isCreating}>
                {isCreating ? "Creating…" : "Create team"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{SIGN_IN_TO_CREATE}</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button render={<Link href={`/auth/signin?from=${encodeURIComponent(returnTo)}`} />} nativeButton={false}>
                Sign in
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
