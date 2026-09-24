"use client";

import { useEffect, useState, type ReactElement } from "react";
import { ArrowRightLeft, ChevronDown, ChevronUp, Crown, Star, UserMinus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { UserAvatar } from "@/components/user-menu/user-avatar";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { rosterControls, type SharedPermissions } from "@/hooks/usePermissions";
import type { Id } from "@/convex/_generated/dataModel";
import { useRoomSettingsActions } from "./hooks/useRoomSettingsActions";
import { usePresenceRoster } from "./room-presence";
import { formatLastSeen } from "./user-presence-avatars";
import { useIsDemoMode } from "./demo/DemoSimulationProvider";

interface ParticipantsSectionProps {
  roomId: Id<"rooms">;
  currentUserId?: Id<"users">;
  /** The relationship decisions; the same in a poker room and a retro. */
  perms: SharedPermissions;
  /** The panel's open state: pending confirmations reset when it closes. */
  isOpen: boolean;
}

/**
 * The settings panels' roster, shared by both ceremonies: everyone in the
 * room with presence and role, and the relationship actions (promote,
 * demote, transfer ownership, remove) each denied control visible but
 * disabled with its reason.
 */
export function ParticipantsSection({ roomId, currentUserId, perms, isOpen }: ParticipantsSectionProps): ReactElement {
  const isDemoMode = useIsDemoMode();
  // Roster from the single presence module, ordered current-user-first, then
  // online-first, then by join time.
  const sortedUsers = usePresenceRoster(currentUserId);
  const settingsActions = useRoomSettingsActions({ roomId });

  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<{id: Id<"users">, name: string} | null>(null);
  const [pendingTransferUser, setPendingTransferUser] = useState<{id: Id<"users">, name: string} | null>(null);

  // Reset pending state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setPendingDeleteUser(null);
      setPendingTransferUser(null);
    }
  }, [isOpen]);

  const handleRemoveUser = (userId: Id<"users">, userName: string) => {
    setPendingDeleteUser({ id: userId, name: userName });
  };

  const handleConfirmRemoveUser = async () => {
    if (!pendingDeleteUser) return;
    setRemovingUserId(pendingDeleteUser.id);
    try {
      await settingsActions.removeUser(pendingDeleteUser.id);
      toast.success("User removed", {
        description: `${pendingDeleteUser.name} has been removed from the room.`,
      });
    } catch (error) {
      console.error("Failed to remove user:", error);
      toast.error("Failed to remove user");
    } finally {
      setRemovingUserId(null);
      setPendingDeleteUser(null);
    }
  };

  const handlePromote = async (userId: Id<"users">, userName: string) => {
    try {
      await settingsActions.promoteFacilitator(userId);
      toast.success("User promoted", {
        description: `${userName} is now a facilitator.`,
      });
    } catch (error) {
      console.error("Failed to promote user:", error);
      toast.error("Failed to promote user");
    }
  };

  const handleDemote = async (userId: Id<"users">, userName: string) => {
    try {
      await settingsActions.demoteFacilitator(userId);
      toast.success("User demoted", {
        description: `${userName} is now a participant.`,
      });
    } catch (error) {
      console.error("Failed to demote user:", error);
      toast.error("Failed to demote user");
    }
  };

  const handleConfirmTransfer = async () => {
    if (!pendingTransferUser) return;
    try {
      await settingsActions.transferOwnership(pendingTransferUser.id);
      toast.success("Ownership transferred", {
        description: `${pendingTransferUser.name} is now the room owner.`,
      });
    } catch (error) {
      console.error("Failed to transfer ownership:", error);
      toast.error("Failed to transfer ownership");
    } finally {
      setPendingTransferUser(null);
    }
  };

  return (
    <>
            {/* Users Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Participants
                </h3>
                <Badge variant="secondary" className="bg-white dark:bg-surface-2 text-xs font-medium px-2.5 py-0.5 rounded-full border border-gray-200 dark:border-border">
                  {sortedUsers.length} Total
                </Badge>
              </div>
              
              <div className="space-y-2 mt-3" data-testid="participant-list">
                {sortedUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-border bg-white/50 dark:bg-surface-2/10">
                    <Users className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 text-center">
                      No participants yet
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 text-center mt-1">
                      Share the room link to invite your team
                    </p>
                  </div>
                ) : (
                  sortedUsers.map((u) => {
                    const userRole = u.role ?? "participant";
                    const isMe = u._id === currentUserId;
                    // Per-action control state from the four relationship
                    // decisions against this target — denied actions render
                    // visible-but-disabled with the denial copy, never vanish.
                    const roster = rosterControls({
                      remove: perms.removeTarget(userRole),
                      promote: perms.promoteTarget(userRole),
                      demote: perms.demoteTarget(userRole),
                      transfer: perms.transfer,
                    });

                    return (
                      <div
                        key={u._id}
                        data-testid="participant-row"
                        data-user-name={u.name}
                        className={cn(
                          "flex items-center justify-between py-3 px-4 rounded-xl border shadow-sm transition-all group",
                          isMe 
                            ? "bg-blue-50/50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50 hover:border-blue-200 dark:hover:border-blue-700/50" 
                            : "bg-white dark:bg-surface-2 border-gray-200/50 dark:border-border hover:shadow-md hover:border-gray-300/50 dark:hover:border-border/80"
                        )}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="relative shrink-0">
                            <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" className="w-10 h-10 ring-2 ring-gray-50 dark:ring-surface-1" />
                            <div
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-surface-2",
                                u.isOnline ? "bg-green-500" : "bg-gray-400"
                              )}
                            />
                          </div>
                          <div className="flex flex-col min-w-0 justify-center">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex items-center gap-1.5">
                                {u.name}
                                {isMe && <span className="text-[10px] text-gray-500 font-medium bg-white/60 dark:bg-surface-3/50 px-1.5 py-0.5 rounded-sm border border-gray-200/50 dark:border-border">(You)</span>}
                              </span>
                              {userRole === "owner" && (
                                <Badge variant="secondary" className="h-5 text-[10px] px-2 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/50 gap-1 shrink-0">
                                  <Crown className="h-3 w-3" />
                                  Owner
                                </Badge>
                              )}
                              {userRole === "facilitator" && (
                                <Badge variant="secondary" className="h-5 text-[10px] px-2 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200/50 dark:border-blue-900/50 gap-1 shrink-0">
                                  <Star className="h-3 w-3" />
                                  Facilitator
                                </Badge>
                              )}
                              {u.isSpectator && (
                                <Badge variant="secondary" className="h-5 text-[10px] px-2 bg-gray-100 dark:bg-surface-3 shrink-0">
                                  Spectator
                                </Badge>
                              )}
                            </div>
                            {!u.isOnline && u.lastSeen && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {formatLastSeen(u.lastSeen)}
                              </span>
                            )}
                          </div>
                        </div>
                        {!isDemoMode && !isMe && (
                          <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                            {/* Promote button */}
                            <Tooltip>
                              <TooltipTrigger render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={roster.promote.enabled ? () => handlePromote(u._id, u.name) : undefined}
                                  disabled={!roster.promote.enabled}
                                  className={cn(
                                    roster.promote.enabled
                                      ? "hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                                      : "opacity-40 cursor-not-allowed",
                                  )}
                                  aria-label={
                                    roster.promote.enabled
                                      ? `Promote ${u.name} to facilitator`
                                      : roster.promote.denial
                                  }
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                              } />
                              <TooltipContent>
                                <p>
                                  {roster.promote.enabled ? "Promote to facilitator" : roster.promote.denial}
                                </p>
                              </TooltipContent>
                            </Tooltip>

                            {/* Demote button */}
                            <Tooltip>
                              <TooltipTrigger render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={roster.demote.enabled ? () => handleDemote(u._id, u.name) : undefined}
                                  disabled={!roster.demote.enabled}
                                  className={cn(
                                    roster.demote.enabled
                                      ? "hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-400"
                                      : "opacity-40 cursor-not-allowed",
                                  )}
                                  aria-label={
                                    roster.demote.enabled
                                      ? `Demote ${u.name} to participant`
                                      : roster.demote.denial
                                  }
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              } />
                              <TooltipContent>
                                <p>
                                  {roster.demote.enabled ? "Demote to participant" : roster.demote.denial}
                                </p>
                              </TooltipContent>
                            </Tooltip>

                            {/* Transfer ownership button */}
                            <Tooltip>
                              <TooltipTrigger render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={roster.transfer.enabled ? () => setPendingTransferUser({ id: u._id, name: u.name }) : undefined}
                                  disabled={!roster.transfer.enabled}
                                  className={cn(
                                    roster.transfer.enabled
                                      ? "hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-500/10 dark:hover:text-purple-400"
                                      : "opacity-40 cursor-not-allowed",
                                  )}
                                  aria-label={
                                    roster.transfer.enabled
                                      ? `Transfer ownership to ${u.name}`
                                      : roster.transfer.denial
                                  }
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </Button>
                              } />
                              <TooltipContent>
                                <p>
                                  {roster.transfer.enabled ? "Transfer ownership" : roster.transfer.denial}
                                </p>
                              </TooltipContent>
                            </Tooltip>

                            {/* Remove button */}
                            <Tooltip>
                              <TooltipTrigger render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={roster.remove.enabled ? () => handleRemoveUser(u._id, u.name) : undefined}
                                  disabled={removingUserId === u._id || !roster.remove.enabled}
                                  className={cn(
                                    roster.remove.enabled
                                      ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                                      : "opacity-40 cursor-not-allowed",
                                  )}
                                  aria-label={
                                    roster.remove.enabled
                                      ? `Remove ${u.name}`
                                      : roster.remove.denial
                                  }
                                >
                                  <UserMinus className="h-4 w-4" />
                                </Button>
                              } />
                              <TooltipContent>
                                <p>
                                  {roster.remove.enabled ? "Remove user" : roster.remove.denial}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

      {/* Remove user confirmation dialog */}
      <AlertDialog
        open={!!pendingDeleteUser}
        onOpenChange={(open) => !open && setPendingDeleteUser(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDeleteUser?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the user from the room. They can rejoin using the room link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmRemoveUser}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer ownership confirmation dialog */}
      <AlertDialog
        open={!!pendingTransferUser}
        onOpenChange={(open) => !open && setPendingTransferUser(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer ownership to {pendingTransferUser?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will become a participant. This action cannot be undone by you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmTransfer}>
              Transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
