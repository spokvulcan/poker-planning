"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { UserAvatar } from "@/components/user-menu/user-avatar";
import { ViewerMenu, menuName } from "@/components/user-menu/viewer-menu";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";

export function NavUser() {
  const { viewer } = useAuth();
  const { isMobile } = useSidebar();

  // The button's skeleton while the viewer loads. A guest signed in with no
  // users row yet gets the menu, as "Guest".
  if (viewer.status !== "signedIn") {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const userName = menuName(viewer);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <ViewerMenu
          viewer={viewer}
          className="min-w-56 rounded-lg"
          side={isMobile ? "bottom" : "right"}
          align="end"
          sideOffset={4}
          trigger={
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                />
              }
            >
              <UserAvatar name={userName} avatarUrl={viewer.avatarUrl} size="sm" className="size-8" />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{userName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {viewer.email || "Guest"}
                </span>
              </div>
              <HugeiconsIcon
                icon={MoreHorizontalIcon}
                strokeWidth={2}
                className="ml-auto size-4"
              />
            </DropdownMenuTrigger>
          }
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
