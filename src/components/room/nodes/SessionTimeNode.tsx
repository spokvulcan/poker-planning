"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, type ReactElement } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { clockText } from "@/convex/roundTime";
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
  const {
    session: { items, total, tickets, quickVotes, paused },
  } = useRoundClock(roomId, lastActivityAt);
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
                {clockText(total.ms)}
              </span>
            </span>
            <span className="flex items-baseline gap-1.5">
              {paused && (
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
              items.map((item) => (
                <div
                  key={item.startedAt}
                  data-open={item.open || undefined}
                  className={cn(
                    "flex min-w-1 overflow-hidden rounded-sm",
                    item.open && "ring-2 ring-blue-500/30 ring-offset-1 ring-offset-white dark:ring-offset-surface-1",
                  )}
                  style={{ flexGrow: item.time.ms + item.time.breakMs, flexBasis: 0 }}
                >
                  {PARTS.filter((part) => item.time[part] > 0).map((part) => (
                    <TimeTip
                      key={part}
                      className={FILL[part]}
                      style={{ flexGrow: item.time[part], flexBasis: 0 }}
                      content={
                        <span className="grid gap-0.5">
                          <span className="font-medium">{item.title ?? "Quick vote"}</span>
                          <TimeLine label={LABEL[part]} ms={item.time[part]} />
                          {item.rounds > 1 && (
                            <span className="opacity-70">
                              <TimeLine label={`Ticket · ${item.rounds} rounds`} ms={item.time.ms} />
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
