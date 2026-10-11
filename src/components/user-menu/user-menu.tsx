"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Eye } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { rulesOf } from "@/convex/ceremony";
import { useAuth } from "@/components/auth/auth-provider";
import { useCallerQuery } from "@/components/auth/use-caller-query";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { UserAvatar } from "./user-avatar";
import { ViewerMenu, menuName } from "./viewer-menu";

// The trigger's pill, which its skeleton shares so nothing moves when the viewer arrives
const PILL = "flex items-center gap-2 rounded-full border bg-background px-2 py-1.5";

export function UserMenu() {
  const { viewer } = useAuth();

  // Get roomId from URL params (if on a room page)
  const params = useParams();
  const roomId = params.roomId as Id<"rooms"> | undefined;

  // Get room membership data (for spectator status) - only if in a room
  const roomMembership = useCallerQuery(api.users.getMyMembership, roomId ? { roomId } : "skip");

  // Only some ceremonies have spectators (a retro has none); the room page
  // already holds this subscription, so reading the room here costs nothing.
  const roomData = useQuery(api.rooms.get, roomId ? { roomId } : "skip");
  const hasSpectators = roomData?.room ? rulesOf(roomData.room).spectators : false;

  const editUser = useMutation(api.users.edit);

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
  const isInRoom = !!roomMembership;
  const isSpectator = roomMembership?.isSpectator ?? false;

  const handleSpectatorToggle = async (checked: boolean) => {
    if (!roomMembership || !roomId) return;
    try {
      await editUser({ roomId, isSpectator: checked });
    } catch {
      toast.error("Failed to update spectator mode. Please try again.");
    }
  };

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
      settings={
        // Spectator toggle - only where the ceremony has spectators
        isInRoom && hasSpectators && (
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
        )
      }
    />
  );
}
