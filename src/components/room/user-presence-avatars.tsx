"use client";

import { FC } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getColorFromName, getInitial } from "@/lib/avatar-utils";
import { usePresenceRoster } from "./room-presence";

// Format relative time for "last seen" display
export function formatLastSeen(timestamp: number | null): string {
  if (!timestamp) return "";

  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Last seen just now";
  if (minutes < 60) return `Last seen ${minutes}m ago`;
  if (hours < 24) return `Last seen ${hours}h ago`;
  return `Last seen ${days}d ago`;
}

interface UserPresenceAvatarsProps {
  maxVisible?: number;
  size?: "sm" | "default";
}

export const UserPresenceAvatars: FC<UserPresenceAvatarsProps> = ({
  maxVisible = 4,
  size = "sm",
}) => {
  // Roster + ordering come from the single presence module (online first,
  // then by join time) — no per-consumer sorting here.
  const sortedUsers = usePresenceRoster();

  const visibleUsers = sortedUsers.slice(0, maxVisible);
  const remainingCount = sortedUsers.length - maxVisible;

  return (
    <AvatarGroup>
      {visibleUsers.map((user) => (
        <Tooltip key={user._id}>
          <TooltipTrigger
            render={
              <Avatar
                size={size}
                className={cn(
                  "ring-2",
                  user.isOnline ? "ring-green-500" : "ring-gray-400 grayscale"
                )}
              >
                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                <AvatarFallback className={getColorFromName(user.name)}>
                  <span className="text-white font-medium">
                    {getInitial(user.name)}
                  </span>
                </AvatarFallback>
              </Avatar>
            }
          />
          <TooltipContent>
            <div className="text-center">
              <p className="font-medium">
                {user.name}
                {user.isSpectator && " (spectator)"}
              </p>
              <p className="text-xs text-muted-foreground">
                {user.isOnline ? "Online" : formatLastSeen(user.lastSeen)}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
      {remainingCount > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <AvatarGroupCount>+{remainingCount}</AvatarGroupCount>
            }
          />
          <TooltipContent className="p-2 max-h-64 overflow-y-auto">
            <div className="flex flex-col gap-2">
              {sortedUsers.slice(maxVisible).map((user) => (
                <div key={user._id} className="flex items-center gap-2">
                  <Avatar
                    size="sm"
                    className={cn(
                      user.isOnline ? "ring-2 ring-green-500" : "grayscale"
                    )}
                  >
                    {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                    <AvatarFallback className={getColorFromName(user.name)}>
                      <span className="text-white font-medium text-xs">
                        {getInitial(user.name)}
                      </span>
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {user.name}
                      {user.isSpectator && " (spectator)"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {user.isOnline ? "Online" : formatLastSeen(user.lastSeen)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </AvatarGroup>
  );
};
