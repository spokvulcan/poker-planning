"use client";

import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ADD_TO_GROUP,
  CLEAR_SELECTION,
  REMOVE_FROM_GROUP,
  groupCards,
  selectedCards,
} from "@/convex/retroCopy";
import { cn } from "@/lib/utils";

export interface SelectionBarProps {
  /** How many cards are selected; the bar renders nothing for none. */
  count: number;
  /** How many of them already belong to a cluster. */
  inCluster: number;
  /** The clusters on the board, as "Add to group" targets. */
  clusters: readonly { clusterId: string; name: string }[];
  onGroup: () => void;
  onAddTo: (clusterId: string) => void;
  onRemove: () => void;
  onClear: () => void;
  className?: string;
}

/**
 * What a selection can become (spec §10.3, §10.4): a new cluster, part of
 * an existing one, or free again. Open to everyone — forming and changing
 * membership are never in the config. On desktop it floats over the
 * canvas; on a phone the same controls sit in the bottom sheet, fed by
 * tap-select.
 */
export function SelectionBar({
  count,
  inCluster,
  clusters,
  onGroup,
  onAddTo,
  onRemove,
  onClear,
  className,
}: SelectionBarProps) {
  if (count === 0) return null;
  return (
    <div
      data-testid="selection-bar"
      data-count={count}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <span className="text-xs text-muted-foreground">{selectedCards(count)}</span>
      <Button type="button" size="sm" onClick={onGroup}>
        {groupCards(count)}
      </Button>
      {clusters.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
            {ADD_TO_GROUP}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {clusters.map((cluster) => (
              <DropdownMenuItem key={cluster.clusterId} onClick={() => onAddTo(cluster.clusterId)}>
                {cluster.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {inCluster > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={onRemove}>
          {REMOVE_FROM_GROUP}
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon-sm" aria-label={CLEAR_SELECTION} onClick={onClear}>
        <X className="size-4" />
      </Button>
    </div>
  );
}
