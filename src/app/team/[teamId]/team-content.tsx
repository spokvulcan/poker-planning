"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Copy, Crown, RefreshCw, ShieldMinus, ShieldPlus, UserMinus, LogOut, Trash2, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth/auth-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/user-menu/user-avatar";
import { RetroDefaultsPanel, type RetroDefaults } from "@/components/team/retro-defaults-panel";
import { RetroRows } from "@/components/retro/retro-list";
import { TEAM_RETROS_EMPTY, TEAM_RETROS_TITLE } from "@/convex/retroCopy";
import { copyTextToClipboard } from "@/utils/copy-text-to-clipboard";
import { toast } from "@/lib/toast";

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
 * Every write on this page fails the same way: the server's refusal copy
 * (the last-admin rule, a stale role) or a fallback, in a toast.
 */
async function run(fn: () => Promise<unknown>, fallback: string): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : fallback);
    return false;
  }
}

/**
 * The team page (spec §5, §18.1), members only: the Team's retros in
 * creation order, members with roles, the invite link, the retro-defaults
 * panel, New retro, and admin-only Delete team. The history row, action
 * items and export arrive with #299.
 */
export function TeamContent() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as Id<"teams">;
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const team = useQuery(api.teams.get, isAuthenticated ? { teamId } : "skip");
  const retros = useQuery(api.retro.listForTeam, isAuthenticated ? { teamId } : "skip");

  const rename = useMutation(api.teams.rename);
  const rotateInvite = useMutation(api.teams.rotateInvite);
  const promote = useMutation(api.teams.promote);
  const demote = useMutation(api.teams.demote);
  const removeMember = useMutation(api.teams.removeMember);
  const leave = useMutation(api.teams.leave);
  const updateRetroDefaults = useMutation(api.teams.updateRetroDefaults);
  const deleteTeam = useMutation(api.teams.remove);

  // The rename draft, keyed to the stored name it was typed over: a query
  // update that changes the stored name discards the draft, and no effect
  // is needed to sync the two.
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ userId: Id<"users">; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (authLoading || !isAuthenticated || team === undefined) {
    return <Centered title="Loading…" body="Fetching the team" />;
  }

  const isAdmin = team.myRole === "admin";
  const name = draft && draft.base === team.name ? draft.value : team.name;
  const setName = (value: string) => setDraft({ base: team.name, value });
  const inviteUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/team/join/${team.inviteToken}`;

  const handleRename = async () => {
    const trimmed = name.trim();
    setDraft(null);
    if (!trimmed || trimmed === team.name) return;
    if (await run(() => rename({ teamId, name: trimmed }), "Failed to rename team")) {
      toast.success("Team renamed");
    }
  };

  const handleCopyInvite = async () => {
    if (await copyTextToClipboard(inviteUrl)) {
      toast.success("Invite link copied to clipboard");
    } else {
      toast.error("Couldn't copy the link. Copy it from the field instead.");
    }
  };

  const handleRotate = async () => {
    if (await run(() => rotateInvite({ teamId }), "Failed to rotate the invite link")) {
      toast.success("Invite link rotated", { description: "The old link no longer works." });
    }
  };

  const roleMutations = { promote, demote };
  const handleRole = async (action: keyof typeof roleMutations, userId: Id<"users">) => {
    await run(() => roleMutations[action]({ teamId, targetUserId: userId }), "Failed to change role");
  };

  const handleConfirmRemove = async () => {
    if (!pendingRemove) return;
    const removed = pendingRemove;
    setPendingRemove(null);
    if (await run(() => removeMember({ teamId, targetUserId: removed.userId }), "Failed to remove member")) {
      toast.success("Member removed", {
        description: `${removed.name} no longer has access to this team's retros.`,
      });
    }
  };

  // Confirmations stay open on failure (the last-admin rule, most often),
  // so the next attempt is one click away.
  const handleLeave = async () => {
    if (await run(() => leave({ teamId }), "Failed to leave the team")) {
      setConfirmLeave(false);
      router.push("/dashboard/retros");
    }
  };

  // No success toast here on purpose: the control itself shows the new
  // value, and a failure rolls it back (the panel's contract) with a toast.
  const handleRetroDefaults = (next: RetroDefaults) =>
    run(() => updateRetroDefaults({ teamId, retroDefaults: next }), "Failed to update retro defaults");

  const handleDelete = async () => {
    setIsDeleting(true);
    if (await run(() => deleteTeam({ teamId }), "Failed to delete team")) {
      toast.success(`${team.name} deleted`);
      router.push("/dashboard/retros");
    } else {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 pt-32 pb-16 sm:px-6 sm:pt-40">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              {isAdmin ? (
                <Input
                  aria-label="Team name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  maxLength={100}
                  className="h-10 max-w-md text-xl font-semibold"
                />
              ) : (
                <h1 className="truncate text-2xl font-bold tracking-tight">{team.name}</h1>
              )}
            </div>
            <Button render={<Link href={`/retro/new?team=${teamId}`} />} nativeButton={false}>
              <Plus className="size-4" />
              New retro
            </Button>
          </div>

          {/* Retros (spec §5): the Team's history in creation order */}
          <Card>
            <CardHeader>
              <CardTitle>{TEAM_RETROS_TITLE}</CardTitle>
            </CardHeader>
            <CardContent>
              {retros === undefined ? (
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
              ) : retros.length === 0 ? (
                <p className="text-sm text-muted-foreground">{TEAM_RETROS_EMPTY}</p>
              ) : (
                <RetroRows rows={retros} />
              )}
            </CardContent>
          </Card>

          {/* Members */}
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>
                Members can read every retro this team keeps. Admins manage the team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {team.members.map((member) => {
                const isMe = member.userId === team.myUserId;
                return (
                  <div
                    key={member.userId}
                    data-testid="team-member-row"
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-surface-3/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={member.name} avatarUrl={member.avatarUrl} size="md" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {member.name}
                          {isMe && <span className="ml-1 text-muted-foreground">(you)</span>}
                        </p>
                      </div>
                      <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                        {member.role === "admin" && <Crown className="size-3" />}
                        {member.role}
                      </Badge>
                    </div>
                    {isAdmin && !isMe && (
                      <div className="flex shrink-0 items-center gap-1">
                        {member.role === "member" ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Make ${member.name} an admin`}
                                  onClick={() => handleRole("promote", member.userId)}
                                />
                              }
                            >
                              <ShieldPlus className="size-4" />
                            </TooltipTrigger>
                            <TooltipContent>Make admin</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Make ${member.name} a member`}
                                  onClick={() => handleRole("demote", member.userId)}
                                />
                              }
                            >
                              <ShieldMinus className="size-4" />
                            </TooltipTrigger>
                            <TooltipContent>Make member</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Remove ${member.name}`}
                                onClick={() => setPendingRemove({ userId: member.userId, name: member.name })}
                              />
                            }
                          >
                            <UserMinus className="size-4 text-destructive" />
                          </TooltipTrigger>
                          <TooltipContent>Remove from team</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Invite */}
          <Card>
            <CardHeader>
              <CardTitle>Invite link</CardTitle>
              <CardDescription>
                Anyone with a signed-in account who opens this link joins as a member.
                {isAdmin && " Rotating it stops the old link from working."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={inviteUrl} aria-label="Invite link" className="font-mono text-xs" />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCopyInvite}>
                    <Copy className="size-4" />
                    Copy
                  </Button>
                  {isAdmin && (
                    <Button variant="outline" onClick={handleRotate}>
                      <RefreshCw className="size-4" />
                      Rotate
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Retro defaults */}
          <Card>
            <CardHeader>
              <CardTitle>Retro defaults</CardTitle>
              <CardDescription>
                Copied onto every new retro this team creates. Changing them never touches a retro that already exists.
                {!isAdmin && " Only admins can edit these."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RetroDefaultsPanel value={team.retroDefaults} canEdit={isAdmin} onChange={handleRetroDefaults} />
            </CardContent>
          </Card>

          {/* Leave / delete */}
          <Card>
            <CardHeader>
              <CardTitle>Membership</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setConfirmLeave(true)}>
                <LogOut className="size-4" />
                Leave team
              </Button>
              {isAdmin && (
                <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" />
                  Delete team
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />

      <AlertDialog open={!!pendingRemove} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this team&apos;s retros. Nothing they wrote is changed, and they keep any retro they already attended.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmRemove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {team.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You lose access to this team&apos;s retros. You keep any retro you already attended.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={(open) => !isDeleting && setConfirmDelete(open)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {team.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {team.roomCount} {team.roomCount === 1 ? "retro" : "retros"} and their action items are removed permanently. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
