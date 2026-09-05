"use client";

import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ResolvedDecision } from "@/convex/permissions";
import { permissionProps } from "@/hooks/usePermissions";
import type { OutsideTopic, TopicRef, WalkRead } from "@/convex/model/walk";
import {
  COVERED_LABEL,
  CURRENT_TOPIC,
  GO_TO_TOPIC,
  RAISE_TOPIC,
  WALK_EMPTY,
  WALK_TITLE,
  coverageReadout,
  topicsWithoutVotes,
  writtenSince,
} from "@/convex/retroCopy";

/** The `stageFlow` acts on the walk, as the board wires them; absent for a Team reader. */
export interface WalkPanelActions {
  decision: ResolvedDecision;
  /** Move the shared cursor to an entry's stored index. */
  onSetCursor: (index: number) => void;
  onMarkCovered: (topicId: string, covered: boolean) => void;
  onRaise: (ref: TopicRef) => void;
}

export interface WalkPanelProps {
  walk: WalkRead;
  /** A topic's label: a cluster's name, a card's headline. */
  labelOf: (ref: TopicRef) => string;
  /** Pan this viewer to the topic; open to everyone. */
  onGo: (ref: TopicRef) => void;
  actions?: WalkPanelActions;
  className?: string;
}

/**
 * The walk panel (spec §12.3, ADR-0023): the order the team steps through,
 * with a tick per covered topic and the current one marked; the readout
 * "{covered} of {total} covered · {late} new" over the live entries, never
 * the board; then, outside the walk, what was written since the order was
 * set (open) and the topics without votes (collapsed), each with Go and
 * Raise. Go on an order row moves the shared cursor for a `stageFlow`
 * holder and pans for anyone else; nothing here is optimistic.
 */
export function WalkPanel({ walk, labelOf, onGo, actions, className }: WalkPanelProps) {
  const allowed = actions?.decision.allowed === true;
  const deny = actions ? permissionProps(actions.decision) : {};
  const late = walk.outside.filter((topic) => topic.late);
  const unvoted = walk.outside.filter((topic) => !topic.late);
  const raise = (ref: TopicRef) =>
    actions && (
      <Button type="button" variant="outline" size="xs" onClick={() => actions.onRaise(ref)} {...deny}>
        {RAISE_TOPIC}
      </Button>
    );
  return (
    <section
      data-testid="walk-panel"
      data-covered={walk.covered}
      data-remaining={walk.total - walk.covered}
      data-late={walk.late}
      aria-label={WALK_TITLE}
      className={cn("flex flex-col gap-3 text-sm", className)}
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{WALK_TITLE}</h2>
        <p data-testid="coverage-readout" className="font-medium tabular-nums">
          {coverageReadout(walk.covered, walk.total, walk.late)}
        </p>
      </header>
      {walk.entries.length === 0 ? (
        <p className="text-muted-foreground">{WALK_EMPTY}</p>
      ) : (
        <ol data-testid="walk-order" className="flex flex-col gap-1">
          {walk.entries.map((entry) => {
            const id = entry.ref.id;
            const current = entry.index === walk.cursor;
            return (
              <li
                key={id}
                data-topic-id={id}
                data-current={String(current)}
                data-ticked={String(entry.covered)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-1.5 py-1",
                  current && "bg-blue-50 dark:bg-status-info-bg"
                )}
              >
                {actions && (
                  <Checkbox
                    aria-label={COVERED_LABEL}
                    checked={entry.covered}
                    onCheckedChange={(checked) => actions.onMarkCovered(id, checked === true)}
                    {...deny}
                  />
                )}
                <span className={cn("min-w-0 flex-1 truncate", entry.covered && "text-muted-foreground line-through")}>
                  {labelOf(entry.ref)}
                </span>
                {current && (
                  <span className="rounded-full bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-800 uppercase dark:bg-status-info-bg dark:text-status-info-fg">
                    {CURRENT_TOPIC}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={GO_TO_TOPIC}
                  onClick={() => (allowed ? actions!.onSetCursor(entry.index) : onGo(entry.ref))}
                >
                  <Crosshair className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      <OutsideSection testId="walk-late" open title={writtenSince(late.length)} topics={late} labelOf={labelOf} onGo={onGo} raise={raise} />
      <OutsideSection
        testId="walk-unvoted"
        title={topicsWithoutVotes(unvoted.length)}
        topics={unvoted}
        labelOf={labelOf}
        onGo={onGo}
        raise={raise}
        className="text-muted-foreground"
      />
    </section>
  );
}

/** One group of topics outside the walk (spec §12.3); nothing when the group is empty. */
function OutsideSection({
  testId,
  title,
  open,
  topics,
  labelOf,
  onGo,
  raise,
  className,
}: {
  testId: string;
  title: string;
  open?: boolean;
  topics: readonly OutsideTopic[];
  labelOf: (ref: TopicRef) => string;
  onGo: (ref: TopicRef) => void;
  raise: (ref: TopicRef) => React.ReactNode;
  className?: string;
}) {
  if (topics.length === 0) return null;
  return (
    <details data-testid={testId} open={open}>
      <summary className={cn("cursor-pointer text-xs font-medium", className)}>{title}</summary>
      <ul className="mt-1 flex flex-col gap-1">
        {topics.map((topic) => (
          <OutsideRow key={topic.ref.id} label={labelOf(topic.ref)} topicRef={topic.ref} onGo={onGo} raise={raise(topic.ref)} />
        ))}
      </ul>
    </details>
  );
}

function OutsideRow({
  label,
  topicRef,
  onGo,
  raise,
}: {
  label: string;
  topicRef: TopicRef;
  onGo: (ref: TopicRef) => void;
  raise: React.ReactNode;
}) {
  return (
    <li data-topic-id={topicRef.id} className="flex items-center gap-2 rounded-md px-1.5 py-1">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={GO_TO_TOPIC} onClick={() => onGo(topicRef)}>
        <Crosshair className="size-3.5" />
      </Button>
      {raise}
    </li>
  );
}
