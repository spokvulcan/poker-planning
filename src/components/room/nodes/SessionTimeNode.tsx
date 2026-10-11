"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, type ReactElement } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { clockText, roundsTime, type TimeSplit } from "@/convex/roundTime";
import { cn } from "@/lib/utils";
import { useRoundClock } from "../hooks/use-round-clock";
import { TimeLine, TimeTip } from "../round-clock/time-tip";
import type { SessionTimeNodeType } from "../types";

const FILL = {
  votingMs: "bg-blue-500",
  discussionMs: "bg-emerald-500",
  breakMs: "bg-[repeating-linear-gradient(135deg,rgb(156_163_175/0.6)_0_2px,transparent_2px_5px)]",
} as const;
const LABEL = { votingMs: "Voting", discussionMs: "Discussion", breakMs: "Break" } as const;
const PARTS = ["votingMs", "discussionMs", "breakMs"] as const;

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Session time (ADR-0032): one strip for the session above the session node,
 * a block per ticket split into voting, discussion and breaks, the current
 * ticket growing as it runs. Every stretch says its time on hover. Hidden by
 * default; the session node's right-click menu shows it.
 */
export const SessionTimeNode = memo(({ data, selected }: NodeProps<SessionTimeNodeType>): ReactElement => {
  const {
    roomId,
    lastActivityAt,
    permissions: { roomSettings },
    actions,
  } = data;
  const { view, now, breaks } = useRoundClock(roomId, lastActivityAt);
  const from = view?.sessionStartedAt ?? undefined;

  const items = (view?.items ?? [])
    .map((item) => ({ item, split: roundsTime(item.rounds, breaks, now, { from }) }))
    .filter(({ split }) => split.votingMs + split.discussionMs > 0);
  const total = items.reduce<TimeSplit>(
    (sum, { split }) => ({
      votingMs: sum.votingMs + split.votingMs,
      discussionMs: sum.discussionMs + split.discussionMs,
      breakMs: sum.breakMs + split.breakMs,
    }),
    { votingMs: 0, discussionMs: 0, breakMs: 0 },
  );
  const tickets = items.filter(({ item }) => item.issueId).length;
  const quickVotes = items.length - tickets;
  const lastOpen = view?.items.at(-1)?.rounds.at(-1)?.endedAt === undefined;
  const tally = [
    tickets > 0 && count(tickets, "ticket"),
    quickVotes > 0 && count(quickVotes, "round"),
  ].filter(Boolean);

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="relative" />}>
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          className="bg-gray-400! dark:bg-surface-3!"
          aria-hidden="true"
        />
        <div
          className={cn(
            "w-[440px] rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-md dark:border-border dark:bg-surface-1",
            selected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-blue-400 dark:ring-offset-surface-1",
          )}
        >
          <div className="flex items-baseline justify-between gap-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-baseline gap-2">
              Session
              <span className="font-mono text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                {clockText(total.votingMs + total.discussionMs)}
              </span>
            </span>
            <span className="flex items-baseline gap-1.5">
              {view?.pausedAt != null && (
                <span className="mr-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-surface-2 dark:text-gray-300">
                  Paused
                </span>
              )}
              {tally.join(" · ")}
              {total.breakMs > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    <span className="font-mono tabular-nums">{clockText(total.breakMs)}</span> break
                  </span>
                </>
              )}
            </span>
          </div>
          <div className="nodrag nopan mt-2 flex h-4 gap-0.5">
            {items.length === 0 ? (
              <TimeTip className="flex-1 rounded-sm bg-gray-100 dark:bg-surface-2" content="Starts with the first round" />
            ) : (
              items.map(({ item, split }, index) => (
                <div
                  key={`${item.rounds[0].startedAt}`}
                  className={cn(
                    "flex min-w-1 overflow-hidden rounded-sm",
                    index === items.length - 1 &&
                      lastOpen &&
                      "ring-2 ring-blue-500/30 ring-offset-1 ring-offset-white dark:ring-offset-surface-1",
                  )}
                  style={{ flexGrow: split.votingMs + split.discussionMs + split.breakMs, flexBasis: 0 }}
                >
                  {PARTS.filter((part) => split[part] > 0).map((part) => (
                    <TimeTip
                      key={part}
                      className={FILL[part]}
                      style={{ flexGrow: split[part], flexBasis: 0 }}
                      content={
                        <span className="grid gap-0.5">
                          <span className="font-medium">{item.title ?? "Quick vote"}</span>
                          <TimeLine label={LABEL[part]} ms={split[part]} />
                          {item.rounds.length > 1 && (
                            <span className="opacity-70">
                              <TimeLine
                                label={`Ticket · ${item.rounds.length} rounds`}
                                ms={split.votingMs + split.discussionMs}
                              />
                            </span>
                          )}
                        </span>
                      }
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem onClick={() => actions.setTimeNodeShown("sessionTime", false)} disabled={!roomSettings.allowed}>
          Hide session time
        </ContextMenuItem>
        <p className="px-1.5 py-1 text-xs text-muted-foreground">Time is tracked either way.</p>
      </ContextMenuContent>
    </ContextMenu>
  );
});

SessionTimeNode.displayName = "SessionTimeNode";
