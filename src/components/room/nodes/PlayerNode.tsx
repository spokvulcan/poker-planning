"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { ReactElement, memo } from "react";
import { Crown, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { UserAvatar } from "../../user-menu/user-avatar";
import type { PlayerNodeType } from "../types";

export const PlayerNode = memo(
  ({ data, selected }: NodeProps<PlayerNodeType>): ReactElement => {
    const { user, isCurrentUser, isCardPicked, card, phase, role } = data;

    // Match VotingCardNode card style
    const cardClasses = cn(
      "h-24 w-16 rounded-xl border-2 flex items-center justify-center text-2xl font-bold bg-white dark:bg-surface-1 border-gray-300 dark:border-border shadow-md",
      selected && "ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-surface-1"
    );

    // Vote status emoji logic:
    // - 👀 spectator (spectator mode, not voting)
    // - 🤔 thinking (round not revealed, hasn't voted)
    // - ✅ voted (round not revealed, vote hidden)
    // - 😴 didn't vote (revealed, no vote)
    // - card value (revealed, voted)
    const getVoteDisplay = () => {
      if (user.isSpectator) {
        return "👀";
      }
      if (phase === "revealed") {
        return isCardPicked ? card : "😴";
      }
      return isCardPicked ? "✅" : "🤔";
    };

    return (
      <div className="relative">
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          className="bg-gray-400! dark:bg-surface-3!"
          aria-hidden="true"
        />
        <div
          className="flex flex-col items-center gap-2"
          role="article"
          aria-label={`Player ${user.name}${isCurrentUser ? " (you)" : ""}${
            user.isSpectator ? ", spectator" : isCardPicked ? ", has voted" : ", has not voted yet"
          }${card ? `, voted ${card}` : ""}${
            role === "owner" ? ", owner" : role === "facilitator" ? ", facilitator" : ""
          }`}
        >
          {/* Card */}
          <div className={cardClasses}>{getVoteDisplay()}</div>

          {/* Player Name & Avatar */}
          <div className="flex items-center gap-1.5">
            {user.avatarUrl && (
              <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
            )}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 text-center">
              {user.name}
              {isCurrentUser && (
                <span className="text-gray-400 dark:text-gray-500"> (you)</span>
              )}
            </span>
            {role === "owner" && (
              <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="Owner" />
            )}
            {role === "facilitator" && (
              <Star className="h-3.5 w-3.5 text-blue-500 shrink-0" aria-label="Facilitator" />
            )}
          </div>
        </div>
      </div>
    );
  },
);

PlayerNode.displayName = "PlayerNode";
