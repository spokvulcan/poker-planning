"use client";

import { useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionsRead } from "@/convex/model/retroActions";
import { ActionRow, type ActionRowActions } from "./action-row";
import type { ActionActions } from "./use-action-actions";

export interface ActionListProps {
  /** Undefined while loading. */
  read: ActionsRead | undefined;
  /** The line for no items. */
  empty: string;
  /** Name each item's retro: the review and the team page. */
  showRoom?: boolean;
  /** The writes, bound here to each item's room; absent for a Team reader. */
  actions?: ActionActions;
  now?: number;
  testId?: string;
}

/**
 * A list of action items over one read (spec §13): each row's owner picker
 * draws on its own retro's attendees, and each act is bound to the row's
 * room, so one list serves the retro's panel, the review and the team page.
 */
export function ActionList({ read, empty, showRoom, actions, now, testId = "action-list" }: ActionListProps) {
  const roomsById = useMemo(() => new Map((read?.rooms ?? []).map((room) => [room.roomId, room])), [read]);
  const bound = useMemo<((roomId: Id<"rooms">) => ActionRowActions) | undefined>(
    () =>
      actions &&
      ((roomId) => ({
        onSetStatus: (actionId, status, note) => actions.setStatus(roomId, actionId, status, note),
        onEdit: (actionId, text, dueAt) => actions.edit(roomId, actionId, text, dueAt),
        onAssign: (actionId, ownerId) => actions.assign(roomId, actionId, ownerId),
        onDelete: (actionId) => actions.remove(roomId, actionId),
      })),
    [actions]
  );
  if (read === undefined) {
    return <div data-testid={testId} className="h-10 animate-pulse rounded-lg bg-muted" />;
  }
  if (read.items.length === 0) {
    return (
      <p data-testid={testId} data-count="0" className="text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <ul data-testid={testId} data-count={read.items.length} className="flex flex-col gap-1.5">
      {read.items.map((item) => {
        const room = roomsById.get(item.roomId);
        return (
          <ActionRow
            key={item._id}
            item={item}
            members={room?.members ?? []}
            attending={room?.attending ?? true}
            now={now}
            showRoom={showRoom}
            actions={bound?.(item.roomId)}
          />
        );
      })}
    </ul>
  );
}
