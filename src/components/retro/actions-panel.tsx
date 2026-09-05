"use client";

import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionsRead } from "@/convex/model/retroActions";
import { ACTIONS_EMPTY, ACTIONS_TITLE, closeFacts } from "@/convex/retroCopy";
import { ActionList } from "./action-list";
import { ActionComposer, type ActionSource } from "./action-composer";
import { factsOf } from "./actions";
import type { ActionActions, CreateActionInput } from "./use-action-actions";

export interface ActionsPanelProps {
  roomId: Id<"rooms">;
  /** `retro.actions`; undefined while loading. */
  read: ActionsRead | undefined;
  /** Whether the shared pointer is in `close`: the facts line shows there (spec §7). */
  atClose: boolean;
  /** The writes; absent for a Team reader, who reads and never writes. */
  actions?: ActionActions;
  /** The composer's pre-filled source, from "Add action" on the walk's topic. */
  source?: ActionSource;
  onClearSource?: () => void;
  className?: string;
}

/**
 * The retro's actions panel (spec §13, ADR-0017): this retro's items at
 * every stage, the composer for attendees, and at `close` the facts line
 * "{n} actions, {m} unowned" and nothing about too many or too few. Counts
 * come from the bounded read, never a stored counter (ADR-0024).
 */
export function ActionsPanel({ roomId, read, atClose, actions, source, onClearSource, className }: ActionsPanelProps) {
  const facts = read ? factsOf(read.items) : undefined;
  const members = read?.rooms.find((room) => room.roomId === roomId)?.members ?? [];
  const onSubmit = actions ? (input: CreateActionInput) => actions.create(roomId, input) : undefined;
  return (
    <section
      data-testid="actions-panel"
      data-count={facts?.count ?? ""}
      data-unowned={facts?.unowned ?? ""}
      aria-label={ACTIONS_TITLE}
      className={cn("flex flex-col gap-3 text-sm", className)}
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{ACTIONS_TITLE}</h2>
        {atClose && facts && (
          <p data-testid="close-facts" className="font-medium tabular-nums">
            {closeFacts(facts.count, facts.unowned)}
          </p>
        )}
      </header>
      {onSubmit && <ActionComposer members={members} source={source} onClearSource={onClearSource} onSubmit={onSubmit} />}
      <ActionList read={read} empty={ACTIONS_EMPTY} actions={actions} testId="actions-list" />
    </section>
  );
}
