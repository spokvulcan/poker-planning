"use client";

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { useAuth } from "@/components/auth/auth-provider";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./user-avatar";
import { ViewerMenu, menuName } from "./viewer-menu";

// The trigger's pill, which its skeleton shares so nothing moves when the viewer arrives
const PILL = "flex items-center gap-2 rounded-full border bg-background px-2 py-1.5";

/**
 * The account menu in the app's header and on the boards: the viewer's
 * ViewerMenu with their places. On a board, the room hands it the menu items
 * of the viewer's seat (sitting out, coming back, leaving:
 * room/seat-controls.tsx), so the menu itself knows nothing of rooms and
 * opens no read of its own.
 */
export function UserMenu({ seat }: { seat?: ReactNode } = {}) {
  const { viewer } = useAuth();

  // A visitor has no menu (the navbar offers Sign in), and the trigger's
  // skeleton stands in while the viewer loads. A guest signed in with no
  // users row yet gets the menu, as "Guest".
  if (viewer.status === "visitor") return null;
  if (viewer.status === "loading") {
    return (
      <div data-testid="user-menu-skeleton" aria-hidden className={PILL}>
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="hidden h-4 w-16 sm:block" />
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
      </div>
    );
  }

  const userName = menuName(viewer);

  return (
    <ViewerMenu
      viewer={viewer}
      align="end"
      className="w-56"
      withPlaces
      trigger={
        <DropdownMenuTrigger
          data-testid="user-menu-trigger"
          className={cn(PILL, "hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        >
          <UserAvatar name={userName} avatarUrl={viewer.avatarUrl} size="sm" />
          <span className="text-sm font-medium max-w-24 truncate hidden sm:block">
            {userName}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="size-4 text-muted-foreground"
          />
        </DropdownMenuTrigger>
      }
      settings={seat}
    />
  );
}
