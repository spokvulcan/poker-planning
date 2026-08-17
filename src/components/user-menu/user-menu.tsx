"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { useSignOut } from "@/hooks/useSignOut";
import { UserAvatar } from "./user-avatar";
import { EditNameDialog } from "./edit-name-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Moon, Sun, LogOut, UserPen, Monitor, Eye, LayoutDashboard, LogIn, History } from "lucide-react";
import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";

export function UserMenu() {
  const { authUserId, isAnonymous, isAuthenticated, email } = useAuth();
  const { theme, setTheme } = useTheme();
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Get roomId from URL params (if on a room page)
  const params = useParams();
  const roomId = params.roomId as Id<"rooms"> | undefined;

  // Get global user data (derived server-side from auth)
  const globalUser = useQuery(
    api.users.getGlobalUser,
    isAuthenticated ? {} : "skip"
  );

  // Get room membership data (for spectator status) - only if in a room
  const roomMembership = useQuery(
    api.users.getMyMembership,
    isAuthenticated && roomId
      ? { roomId }
      : "skip"
  );

  const editGlobalUser = useMutation(api.users.editGlobalUser);
  const editUser = useMutation(api.users.edit);
  // The one sign-out policy (anonymous-account deletion included). Called
  // above the early return below, per the rules of hooks.
  const handleSignOut = useSignOut();

  if (!authUserId || !globalUser) {
    return null;
  }

  const userName = globalUser.name || "Guest";
  const isInRoom = !!roomMembership;
  const isSpectator = roomMembership?.isSpectator ?? false;

  const handleEditName = async (name: string) => {
    try {
      await editGlobalUser({ name });
    } catch {
      toast.error("Failed to update name. Please try again.");
    }
  };

  const handleSpectatorToggle = async (checked: boolean) => {
    if (!roomMembership || !roomId) return;
    try {
      await editUser({
        userId: roomMembership._id,
        roomId,
        isSpectator: checked,
      });
    } catch {
      toast.error("Failed to update spectator mode. Please try again.");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="user-menu-trigger" className="flex items-center gap-2 rounded-full border bg-background px-2 py-1.5 hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <UserAvatar name={userName} avatarUrl={globalUser.avatarUrl} size="sm" />
          <span className="text-sm font-medium max-w-24 truncate hidden sm:block">
            {userName}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="size-4 text-muted-foreground"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Profile header */}
          <div className="flex items-center gap-3 px-2 py-2">
            <UserAvatar name={userName} avatarUrl={globalUser.avatarUrl} size="lg" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{userName}</span>
              <span className="text-xs text-muted-foreground">{email || "Guest"}</span>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* Dashboard link */}
          <DropdownMenuItem render={<Link href="/dashboard" />}>
            <LayoutDashboard className="mr-2 size-4" />
            Dashboard
          </DropdownMenuItem>

          {/* Sessions link */}
          <DropdownMenuItem render={<Link href="/dashboard/sessions" />}>
            <History className="mr-2 size-4" />
            Sessions
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Sign in link - only for anonymous users, shown first */}
          {isAnonymous && (
            <>
              <DropdownMenuItem render={<Link href={roomId ? `/auth/signin?from=/room/${roomId}` : "/auth/signin"} />}>
                <LogIn className="mr-2 size-4" />
                Sign in
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Edit name */}
          <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
            <UserPen className="mr-2 size-4" />
            Edit name
          </DropdownMenuItem>

          {/* Spectator toggle - only show when in a room */}
          {isInRoom && (
            <div
              data-testid="spectator-toggle-row"
              className="flex items-center justify-between px-1.5 py-1 cursor-pointer rounded-md hover:bg-gray-100 dark:hover:bg-white/10"
              onClick={() => handleSpectatorToggle(!isSpectator)}
            >
              <div className="flex items-center gap-2">
                <Eye className="size-4" />
                <span className="text-sm">Spectator</span>
              </div>
              <Switch
                checked={isSpectator}
                onCheckedChange={handleSpectatorToggle}
                size="sm"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Appearance submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="relative mr-2 size-4">
                <Sun className="absolute size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </span>
              Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuGroup>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) => setTheme(value)}
                >
                  <DropdownMenuRadioItem value="light">
                    <Sun className="mr-2 size-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="mr-2 size-4" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="mr-2 size-4" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* Sign out */}
          <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
            <LogOut className="mr-2 size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditNameDialog
        currentName={userName}
        onSave={handleEditName}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </>
  );
}
