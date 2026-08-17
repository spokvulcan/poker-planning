"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth/auth-provider";
import { useSignOut } from "@/hooks/useSignOut";
import { UserAvatar } from "@/components/user-menu/user-avatar";
import { EditNameDialog } from "@/components/user-menu/edit-name-dialog";
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
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { Moon, Sun, LogOut, UserPen, Monitor, LogIn } from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";

export function NavUser() {
  const { authUserId, isAnonymous, isAuthenticated, email } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isMobile } = useSidebar();
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const globalUser = useQuery(
    api.users.getGlobalUser,
    isAuthenticated ? {} : "skip"
  );

  const editGlobalUser = useMutation(api.users.editGlobalUser);
  // The one sign-out policy (anonymous-account deletion included). Called
  // above the early return below, per the rules of hooks.
  const handleSignOut = useSignOut();

  if (!authUserId || !globalUser) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <div className="size-8 animate-pulse rounded-full bg-muted" />
            <div className="flex flex-1 flex-col gap-1">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-3 w-12 animate-pulse rounded bg-muted" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const userName = globalUser.name || "Guest";

  const handleEditName = async (name: string) => {
    try {
      await editGlobalUser({ name });
    } catch {
      toast.error("Failed to update name. Please try again.");
    }
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                />
              }
            >
              <UserAvatar name={userName} size="sm" className="size-8" />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{userName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {email || "Guest"}
                </span>
              </div>
              <HugeiconsIcon
                icon={MoreHorizontalIcon}
                strokeWidth={2}
                className="ml-auto size-4"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <div className="flex items-center gap-3 px-2 py-2">
                <UserAvatar name={userName} size="lg" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {userName}
                  </span>
                  <span className="text-xs text-muted-foreground">{email || "Guest"}</span>
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* Sign in link - only for anonymous users, shown first */}
              {isAnonymous && (
                <>
                  <DropdownMenuItem render={<Link href="/auth/signin?from=/dashboard" />}>
                    <LogIn className="mr-2 size-4" />
                    Sign in
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                <UserPen className="mr-2 size-4" />
                Edit name
              </DropdownMenuItem>

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

              <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                <LogOut className="mr-2 size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <EditNameDialog
        currentName={userName}
        onSave={handleEditName}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </>
  );
}
