"use client";

import { FC, useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  ArrowRight,
  AlertTriangle,
  Zap,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { SidePanel } from "@/components/ui/side-panel";
import { toast } from "@/lib/toast";
import {
  usePokerPermissions,
  permissionProps,
  permissionInputProps,
} from "@/hooks/usePermissions";
import { IntegrationSettingsSection } from "./integration-settings";
import { useRoomSettingsActions } from "./hooks/useRoomSettingsActions";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import type { PermissionLevel, PokerPermissionCategory, RoomPermissions } from "@/convex/permissions";

import { ParticipantsSection } from "./participants-section";
import { PermissionsSection } from "./permissions-section";
import { ThemeSection } from "./theme-section";
import { useIsDemoMode } from "./demo/DemoSimulationProvider";

interface RoomSettingsPanelProps {
  roomData: RoomWithRelatedData;
  currentUserId?: Id<"users">;
  isOpen: boolean;
  onClose: () => void;
}

const PERMISSION_CONFIG: Record<PokerPermissionCategory, { label: string; description: string }> = {
  revealCards: { label: "Reveal cards", description: "Reveal votes, cancel auto-reveal" },
  gameFlow: { label: "Game flow", description: "Reset game, start voting on issues" },
  issueManagement: { label: "Issue management", description: "Create, edit, delete, reorder issues" },
  roomSettings: { label: "Room settings", description: "Rename room, toggle auto-reveal" },
};

export const RoomSettingsPanel: FC<RoomSettingsPanelProps> = ({
  roomData,
  currentUserId,
  isOpen,
  onClose,
}) => {
  const isDemoMode = useIsDemoMode();

  const [roomName, setRoomName] = useState(roomData.room.name);
  const [isSaving, setIsSaving] = useState(false);

  // Writes come from the action seam, which no-ops internally in demo mode
  // (ADR-0003) — the remaining `isDemoMode` branches below are presentation only
  // (hide/disable/read-only controls), never write guards.
  const settingsActions = useRoomSettingsActions({ roomId: roomData.room._id });

  const perms = usePokerPermissions(roomData, currentUserId);

  // Sync room name with prop when it changes externally
  useEffect(() => {
    setRoomName(roomData.room.name);
  }, [roomData.room.name]);

  const handleSaveRoomName = async () => {
    if (!roomName.trim() || roomName === roomData.room.name) return;

    setIsSaving(true);
    try {
      await settingsActions.rename(roomName.trim());
      toast.success("Room renamed", {
        description: `Room is now called "${roomName.trim()}"`,
      });
    } catch (error) {
      console.error("Failed to rename room:", error);
      toast.error("Failed to rename room");
      setRoomName(roomData.room.name);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAutoReveal = async () => {
    try {
      await settingsActions.toggleAutoComplete();
    } catch (error) {
      console.error("Failed to toggle auto-reveal:", error);
      toast.error("Failed to update setting");
    }
  };

  const handlePermissionChange = async (category: PokerPermissionCategory, value: PermissionLevel) => {
    const newPermissions: RoomPermissions = {
      ...perms.permissions,
      [category]: value,
    };
    try {
      await settingsActions.updatePermissions(newPermissions);
    } catch (error) {
      console.error("Failed to update permissions:", error);
      toast.error("Failed to update permissions");
    }
  };

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
                  onChange={(e) => perms.roomSettings.allowed && setRoomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && perms.roomSettings.allowed) handleSaveRoomName();
                  }}
                  placeholder="Enter room name"
                  className="h-10 text-sm bg-gray-50 dark:bg-surface-2"
                  readOnly={isDemoMode}
                  {...permissionInputProps(perms.roomSettings)}
                />
                {!isDemoMode && (
                  <Button
                    size="default"
                    onClick={handleSaveRoomName}
                    disabled={
                      isSaving ||
                      !roomName.trim() ||
                      roomName === roomData.room.name
                    }
                    className="h-10 px-4 whitespace-nowrap"
                    {...permissionProps(perms.roomSettings)}
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
                onCheckedChange={perms.roomSettings.allowed ? handleToggleAutoReveal : undefined}
                disabled={isDemoMode}
                className="data-[state=checked]:bg-primary"
                {...permissionProps(perms.roomSettings)}
              />
            </div>

            <ThemeSection description="Customize the look of the room" />
          </div>

          {/* Scrollable Bottom Section */}
          <div className="p-6 space-y-8 flex-1">
            {/* Advanced Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Configuration</h3>
              <Accordion className="space-y-3">
                <PermissionsSection
                  config={PERMISSION_CONFIG}
                  permissions={perms.permissions}
                  canChange={perms.changePermissions.allowed}
                  note={{
                    owner: "As the owner, you can control who can perform actions in this room.",
                    others: "Only the room owner can change these permissions.",
                  }}
                  onChange={handlePermissionChange}
                />

                {!isDemoMode && (
                <AccordionItem value="integrations" className="border border-gray-200/50 dark:border-border rounded-lg px-4 bg-white dark:bg-surface-2/30 shadow-sm">
                  <AccordionTrigger className="text-sm font-medium py-3.5 hover:no-underline text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-3">
                      <Zap className="h-4 w-4 text-gray-400" />
                      Integrations
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pt-1">
                    {/* Mounts only while the panel is open (in addition to the
                        accordion's own collapsed-state unmount), so its
                        integration queries detach when the panel closes. */}
                    {isOpen && <IntegrationSettingsSection roomId={roomData.room._id} />}
                  </AccordionContent>
                </AccordionItem>
                )}
              </Accordion>
            </div>

            <ParticipantsSection
              roomId={roomData.room._id}
              currentUserId={currentUserId}
              perms={perms}
              isOpen={isOpen}
            />
            
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

    </>
  );
};
