"use client";

import { FC, useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  Sun,
  Moon,
  Monitor,
  UserMinus,
  ArrowRight,
  Crown,
  Star,
  ChevronUp,
  ChevronDown,
  ArrowRightLeft,
  AlertTriangle,
  Info,
  ShieldAlert,
  Zap,
  Users,
  Settings,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useMutation } from "convex/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { SidePanel } from "@/components/ui/side-panel";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { denialMessage } from "@/convex/permissions";
import { IntegrationSettingsSection } from "./integration-settings";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { PermissionLevel, PermissionCategory, RoomPermissions } from "@/convex/permissions";
import { getEffectivePermissions } from "@/convex/permissions";
import { UserAvatar } from "@/components/user-menu/user-avatar";
import { formatLastSeen } from "./user-presence-avatars";

import { useRoomPresence } from "@/hooks/useRoomPresence";

interface RoomSettingsPanelProps {
  roomData: RoomWithRelatedData;
  currentUserId?: Id<"users">;
  isOpen: boolean;
  onClose: () => void;
  isDemoMode?: boolean;
}

const PERMISSION_CONFIG: Record<PermissionCategory, { label: string; description: string; tooltip: string }> = {
  revealCards: {
    label: "Reveal cards",
    description: "Reveal votes, cancel auto-reveal",
    tooltip: "Controls who can reveal votes and cancel the auto-reveal countdown.",
  },
  gameFlow: {
    label: "Game flow",
    description: "Reset game, start voting on issues",
    tooltip: "Controls who can reset the game, start voting on an issue, or clear the current issue.",
  },
  issueManagement: {
    label: "Issue management",
    description: "Create, edit, delete, reorder issues",
    tooltip: "Controls who can create, edit, delete, and reorder issues in the backlog.",
  },
  roomSettings: {
    label: "Room settings",
    description: "Rename room, toggle auto-reveal",
    tooltip: "Controls who can rename the room and toggle the auto-reveal setting.",
  },
};

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  everyone: "Everyone",
  facilitators: "Facilitators",
  owner: "Owner only",
};

export const RoomSettingsPanel: FC<RoomSettingsPanelProps> = ({
  roomData,
  currentUserId,
  isOpen,
  onClose,
  isDemoMode = false,
}) => {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const usersWithPresence = useRoomPresence(
    roomData.room._id,
    currentUserId ?? "",
    roomData.users
  );

  const [roomName, setRoomName] = useState(roomData.room.name);
  const [isSaving, setIsSaving] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<{id: Id<"users">, name: string} | null>(null);
  const [pendingTransferUser, setPendingTransferUser] = useState<{id: Id<"users">, name: string} | null>(null);
  const openSelectCountRef = useRef(0);

  const renameRoom = useMutation(api.rooms.rename);
  const toggleAutoComplete = useMutation(api.rooms.toggleAutoComplete);
  const removeUser = useMutation(api.users.remove);
  const promoteFacilitator = useMutation(api.roles.promoteFacilitator);
  const demoteFacilitator = useMutation(api.roles.demoteFacilitator);
  const transferOwnership = useMutation(api.roles.transferOwnership);
  const updatePermissions = useMutation(api.roles.updatePermissions);

  const perms = usePermissions(roomData, currentUserId);

  // Sync room name with prop when it changes externally
  useEffect(() => {
    setRoomName(roomData.room.name);
  }, [roomData.room.name]);

  // Reset pending state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setPendingDeleteUser(null);
      setPendingTransferUser(null);
    }
  }, [isOpen]);

  const handleSaveRoomName = async () => {
    if (!roomName.trim() || roomName === roomData.room.name) return;

    setIsSaving(true);
    try {
      await renameRoom({ roomId: roomData.room._id, name: roomName.trim() });
      toast({
        title: "Room renamed",
        description: `Room is now called "${roomName.trim()}"`,
      });
    } catch (error) {
      console.error("Failed to rename room:", error);
      toast({
        title: "Failed to rename room",
        variant: "destructive",
      });
      setRoomName(roomData.room.name);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAutoReveal = async () => {
    try {
      await toggleAutoComplete({ roomId: roomData.room._id });
    } catch (error) {
      console.error("Failed to toggle auto-reveal:", error);
      toast({
        title: "Failed to update setting",
        variant: "destructive",
      });
    }
  };

  const handleRemoveUser = (userId: Id<"users">, userName: string) => {
    setPendingDeleteUser({ id: userId, name: userName });
  };

  const handleConfirmRemoveUser = async () => {
    if (!pendingDeleteUser) return;
    setRemovingUserId(pendingDeleteUser.id);
    try {
      await removeUser({ userId: pendingDeleteUser.id, roomId: roomData.room._id });
      toast({
        title: "User removed",
        description: `${pendingDeleteUser.name} has been removed from the room.`,
      });
    } catch (error) {
      console.error("Failed to remove user:", error);
      toast({
        title: "Failed to remove user",
        variant: "destructive",
      });
    } finally {
      setRemovingUserId(null);
      setPendingDeleteUser(null);
    }
  };

  const handlePromote = async (userId: Id<"users">, userName: string) => {
    try {
      await promoteFacilitator({ roomId: roomData.room._id, targetUserId: userId });
      toast({
        title: "User promoted",
        description: `${userName} is now a facilitator.`,
      });
    } catch (error) {
      console.error("Failed to promote user:", error);
      toast({ title: "Failed to promote user", variant: "destructive" });
    }
  };

  const handleDemote = async (userId: Id<"users">, userName: string) => {
    try {
      await demoteFacilitator({ roomId: roomData.room._id, targetUserId: userId });
      toast({
        title: "User demoted",
        description: `${userName} is now a participant.`,
      });
    } catch (error) {
      console.error("Failed to demote user:", error);
      toast({ title: "Failed to demote user", variant: "destructive" });
    }
  };

  const handleConfirmTransfer = async () => {
    if (!pendingTransferUser) return;
    try {
      await transferOwnership({ roomId: roomData.room._id, targetUserId: pendingTransferUser.id });
      toast({
        title: "Ownership transferred",
        description: `${pendingTransferUser.name} is now the room owner.`,
      });
    } catch (error) {
      console.error("Failed to transfer ownership:", error);
      toast({ title: "Failed to transfer ownership", variant: "destructive" });
    } finally {
      setPendingTransferUser(null);
    }
  };

  const handlePermissionChange = async (category: PermissionCategory, value: PermissionLevel) => {
    const currentPermissions = getEffectivePermissions(roomData.room);
    const newPermissions: RoomPermissions = {
      ...currentPermissions,
      [category]: value,
    };
    try {
      await updatePermissions({ roomId: roomData.room._id, permissions: newPermissions });
    } catch (error) {
      console.error("Failed to update permissions:", error);
      toast({ title: "Failed to update permissions", variant: "destructive" });
    }
  };

  // Filter users: sort online first, then by join time
  const sortedUsers = [...usersWithPresence].sort((a, b) => {
    // Current user always first
    if (a._id === currentUserId) return -1;
    if (b._id === currentUserId) return 1;
    
    // Online users next
    if (a.isOnline !== b.isOnline) {
      return a.isOnline ? -1 : 1;
    }
    // Then by join time (earliest first)
    return a.joinedAt - b.joinedAt;
  });

  const currentPermissions = getEffectivePermissions(roomData.room);

  // Tooltip for the room-name controls, routed through the shared denial copy.
  const roomSettingsTooltip = perms.roomSettings.allowed
    ? undefined
    : denialMessage(
        {
          kind: "category",
          category: "roomSettings",
          level: currentPermissions.roomSettings,
        },
        perms.roomSettings.reason
      );

  return (
    <>
    <SidePanel isOpen={isOpen} onClose={onClose} data-testid="room-settings-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-gray-200/50 dark:border-border shrink-0 bg-white dark:bg-surface-1">
          <div className="flex items-center gap-2.5">
            <Settings className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Room Settings
            </h2>
          </div>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="hover:bg-gray-100 dark:hover:bg-surface-3"
                aria-label="Close settings"
              >
                <X className="h-4 w-4" />
              </Button>
            } />
            <TooltipContent>
              <p>Close</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Content */}
        <div className="flex flex-col min-h-0 flex-1 overflow-y-auto bg-gray-50/30 dark:bg-surface-1">
          {/* Top Fixed Section */}
          <div className="p-6 space-y-6 shrink-0 border-b border-gray-200/50 dark:border-border bg-white dark:bg-surface-1">
            {/* Owner-absent banner */}
            {perms.isOwnerAbsent && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-status-warning-bg border border-amber-200 dark:border-amber-800 shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-status-warning-fg shrink-0" />
                <span className="text-sm text-amber-700 dark:text-status-warning-fg">
                  The room owner has left. Owner-level actions are disabled.
                </span>
              </div>
            )}

            {/* Room Name Section */}
            <div className="space-y-2.5">
              <Label
                htmlFor="room-name"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Room Name
              </Label>
              <div className="flex gap-2">
                <Input
                  id="room-name"
                  value={roomName}
                  onChange={(e) => !isDemoMode && perms.roomSettings.allowed && setRoomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isDemoMode && perms.roomSettings.allowed) handleSaveRoomName();
                  }}
                  placeholder="Enter room name"
                  className="h-10 text-sm bg-gray-50 dark:bg-surface-2"
                  readOnly={isDemoMode || !perms.roomSettings.allowed}
                  title={roomSettingsTooltip}
                />
                {!isDemoMode && (
                  <Button
                    size="default"
                    onClick={handleSaveRoomName}
                    disabled={
                      !perms.roomSettings.allowed ||
                      isSaving ||
                      !roomName.trim() ||
                      roomName === roomData.room.name
                    }
                    className="h-10 px-4 whitespace-nowrap"
                    title={roomSettingsTooltip}
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>
            </div>

            {/* Auto-Reveal Section */}
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-1">
                <Label
                  htmlFor="auto-reveal"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Auto-reveal cards
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Automatically reveal votes when everyone has voted
                </p>
              </div>
              <Switch
                id="auto-reveal"
                checked={roomData.room.autoCompleteVoting}
                onCheckedChange={isDemoMode || !perms.roomSettings.allowed ? undefined : handleToggleAutoReveal}
                disabled={isDemoMode || !perms.roomSettings.allowed}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            {/* Appearance Section (Moved out of accordion) */}
            <div className="pt-5 mt-4 border-t border-gray-100 dark:border-border/50">
              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Theme
                  </Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Customize the look of the room
                  </p>
                </div>
              <div className="flex gap-1.5 p-1 bg-gray-100/80 dark:bg-surface-2 rounded-lg border border-gray-200/50 dark:border-border/50">
                <Tooltip>
                  <TooltipTrigger render={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTheme("light")}
                      className={cn(
                        "flex-1 h-8 px-3 gap-2 rounded-md transition-all text-xs font-medium",
                        theme === "light" 
                          ? "bg-white dark:bg-surface-3 shadow-sm text-gray-900 border border-gray-200/50 dark:border-transparent" 
                          : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                      )}
                    >
                      <Sun className="h-3.5 w-3.5" />
                      Light
                    </Button>
                  } />
                  <TooltipContent><p>Light theme</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTheme("dark")}
                      className={cn(
                        "flex-1 h-8 px-3 gap-2 rounded-md transition-all text-xs font-medium",
                        theme === "dark" 
                          ? "bg-white dark:bg-surface-3 shadow-sm text-gray-900 dark:text-white border border-gray-200/50 dark:border-transparent" 
                          : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                      )}
                    >
                      <Moon className="h-3.5 w-3.5" />
                      Dark
                    </Button>
                  } />
                  <TooltipContent><p>Dark theme</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTheme("system")}
                      className={cn(
                        "flex-1 h-8 px-3 gap-2 rounded-md transition-all text-xs font-medium",
                        theme === "system" 
                          ? "bg-white dark:bg-surface-3 shadow-sm text-gray-900 dark:text-white border border-gray-200/50 dark:border-transparent" 
                          : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                      )}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      System
                    </Button>
                  } />
                  <TooltipContent><p>System theme</p></TooltipContent>
                </Tooltip>
              </div>
              </div>
            </div>
          </div>

          {/* Scrollable Bottom Section */}
          <div className="p-6 space-y-8 flex-1">
            {/* Advanced Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Configuration</h3>
              <Accordion className="space-y-3">
                <AccordionItem value="permissions" className="border border-gray-200/50 dark:border-border rounded-lg px-4 bg-white dark:bg-surface-2/30 shadow-sm">
                  <AccordionTrigger className="text-sm font-medium py-3.5 hover:no-underline text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-4 w-4 text-gray-400" />
                      Permissions
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pt-1">
                    <div className="space-y-4">
                      <div className="flex items-center gap-1.5 p-3 rounded-lg bg-gray-50 dark:bg-surface-3 border border-gray-100 dark:border-border/50">
                        <Info className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="text-xs text-gray-600 dark:text-gray-300">
                          {perms.changePermissions.allowed ? "As the owner, you can control who can perform actions in this room." : "Only the room owner can change these permissions."}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {(Object.keys(PERMISSION_CONFIG) as PermissionCategory[]).map((category) => {
                          const config = PERMISSION_CONFIG[category];
                          return (
                            <div
                              key={category}
                              className="flex items-center justify-between gap-4 py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-surface-3/50 transition-colors border border-transparent hover:border-gray-100 dark:hover:border-border/50"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="min-w-0">
                                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                    {config.label}
                                  </span>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {config.description}
                                  </p>
                                </div>
                              </div>
                              <div className="shrink-0">
                                {perms.changePermissions.allowed ? (
                                  <Select
                                    value={currentPermissions[category]}
                                    onValueChange={(value) => handlePermissionChange(category, value as PermissionLevel)}
                                    onOpenChange={(open) => { openSelectCountRef.current += open ? 1 : -1; }}
                                  >
                                    <SelectTrigger size="sm" className="h-8 text-xs w-[130px] bg-white dark:bg-surface-2">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                      <SelectItem value="everyone">Everyone</SelectItem>
                                      <SelectItem value="facilitators">Facilitators</SelectItem>
                                      <SelectItem value="owner">Owner only</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-md bg-gray-100 dark:bg-surface-3">
                                    {LEVEL_LABELS[currentPermissions[category]]}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                
                {!isDemoMode && (
                <AccordionItem value="integrations" className="border border-gray-200/50 dark:border-border rounded-lg px-4 bg-white dark:bg-surface-2/30 shadow-sm">
                  <AccordionTrigger className="text-sm font-medium py-3.5 hover:no-underline text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-3">
                      <Zap className="h-4 w-4 text-gray-400" />
                      Integrations
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pt-1">
                    <IntegrationSettingsSection roomId={roomData.room._id} />
                  </AccordionContent>
                </AccordionItem>
                )}
              </Accordion>
            </div>

            {/* Users Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Participants
                </h3>
                <Badge variant="secondary" className="bg-white dark:bg-surface-2 text-xs font-medium px-2.5 py-0.5 rounded-full border border-gray-200 dark:border-border">
                  {usersWithPresence.length} Total
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
                    const canRemoveThis = perms.removeTarget(userRole).allowed;
                    const canPromoteThis = perms.promoteTarget(userRole).allowed;
                    const canDemoteThis = perms.demoteTarget(userRole).allowed;
                    const canTransfer = perms.transfer.allowed;

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
                            {/* Promote button (for participants) */}
                            {canPromoteThis && (
                              <Tooltip>
                                <TooltipTrigger render={
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => handlePromote(u._id, u.name)}
                                    className="hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                                    aria-label={`Promote ${u.name} to facilitator`}
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                } />
                                <TooltipContent>
                                  <p>Promote to facilitator</p>
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {/* Demote button (for facilitators, owner only) */}
                            {canDemoteThis && (
                              <Tooltip>
                                <TooltipTrigger render={
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => handleDemote(u._id, u.name)}
                                    className="hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-400"
                                    aria-label={`Demote ${u.name} to participant`}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                } />
                                <TooltipContent>
                                  <p>Demote to participant</p>
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {/* Transfer ownership button (owner only, on non-owners) */}
                            {canTransfer && userRole !== "owner" && (
                              <Tooltip>
                                <TooltipTrigger render={
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setPendingTransferUser({ id: u._id, name: u.name })}
                                    className="hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-500/10 dark:hover:text-purple-400"
                                    aria-label={`Transfer ownership to ${u.name}`}
                                  >
                                    <ArrowRightLeft className="h-4 w-4" />
                                  </Button>
                                } />
                                <TooltipContent>
                                  <p>Transfer ownership</p>
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {/* Remove button */}
                            <Tooltip>
                              <TooltipTrigger render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={canRemoveThis ? () => handleRemoveUser(u._id, u.name) : undefined}
                                  disabled={removingUserId === u._id || !canRemoveThis}
                                  className={cn(
                                    canRemoveThis
                                      ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                                      : "opacity-40 cursor-not-allowed",
                                  )}
                                  aria-label={
                                    canRemoveThis
                                      ? `Remove ${u.name}`
                                      : "You don't have permission to remove this user"
                                  }
                                >
                                  <UserMinus className="h-4 w-4" />
                                </Button>
                              } />
                              <TooltipContent>
                                <p>
                                  {canRemoveThis
                                    ? "Remove user"
                                    : "Only facilitators and the owner can remove members"}
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
            
            {/* Demo CTA */}
            {isDemoMode && (
              <div className="pt-4 mt-8 border-t border-gray-200/50 dark:border-border">
                <Link href="/room/new">
                  <Button className="w-full gap-2 h-11 text-sm font-medium shadow-sm">
                    Create a room to customize settings
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
    </SidePanel>

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
};
