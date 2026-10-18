"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Hourglass, Play, Plus, RotateCcw } from "lucide-react";
import { memo, type ReactElement, type ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TIMEBOX_PRESETS_MS, clockText, countdownText } from "@/convex/roundTime";
import { permissionProps } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { useRoundClock } from "../hooks/use-round-clock";
import { PixelHourglass } from "../round-clock/pixel-hourglass";
import { TimeLine, TimeTip } from "../round-clock/time-tip";
import type { RoundTimerNodeType } from "../types";

function IconButton({
  label,
  onClick,
  overlay,
  children,
}: {
  label: string;
  onClick: () => void;
  overlay: ReturnType<typeof permissionProps>;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            onClick={onClick}
            aria-label={label}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-surface-2 dark:hover:text-gray-100 [&_svg]:h-4 [&_svg]:w-4"
            {...overlay}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{overlay.title ?? label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The poker board's timer (ADR-0032): how long the current ticket has taken,
 * started and stopped by the round itself, with a thin voting/discussion bar
 * under it and the timebox's sand timer beside it. Lengths, the pause and
 * hiding it live on its right-click menu. One height in every state, so
 * nothing on the board shifts when a timebox starts.
 */
export const RoundTimerNode = memo(({ data, selected }: NodeProps<RoundTimerNodeType>): ReactElement => {
  const {
    roomId,
    lastActivityAt,
    permissions: { gameFlow, roomSettings },
    actions,
  } = data;
  const {
    timer: { time, state, timebox: box, nextFlipMs },
  } = useRoundClock(roomId, lastActivityAt);
  const paused = state === "paused";
  const flow = permissionProps(gameFlow);

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="relative" />}>
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className="bg-gray-400! dark:bg-surface-3!"
          aria-hidden="true"
        />
        <div
          role="timer"
          aria-label={`Time on this ticket: ${clockText(time.ms)}`}
          className={cn(
            "w-[168px] rounded-lg border border-gray-200 bg-white px-3 pb-2 pt-1.5 shadow-md dark:border-border dark:bg-surface-1",
            selected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-blue-400 dark:ring-offset-surface-1",
          )}
        >
          <div className="flex h-11 items-center gap-2">
            {box.status !== "idle" && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      onClick={actions.stopTimebox}
                      aria-label="Stop the timebox"
                      className="nodrag nopan flex h-full shrink-0 items-center transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:hover:opacity-100"
                      {...flow}
                    />
                  }
                >
                  <PixelHourglass
                    fraction={box.fraction}
                    tone={box.status}
                    flippedAt={box.startedAt ?? 0}
                    turnOnMount={box.elapsedMs < 1_500}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {box.status === "over"
                    ? `${countdownText(box.durationMs ?? 0)} timebox, ${clockText(box.overtimeMs)} over · click to stop`
                    : `${countdownText(box.remainingMs)} left of ${countdownText(box.durationMs ?? 0)} · click to stop`}
                </TooltipContent>
              </Tooltip>
            )}
            <span
              className={cn(
                "flex-1 font-mono text-2xl font-medium tabular-nums",
                box.status === "over"
                  ? "text-amber-600 dark:text-amber-400"
                  : box.status === "running" || state === "counting"
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-400 dark:text-gray-500",
              )}
            >
              {box.status === "running"
                ? countdownText(box.remainingMs)
                : box.status === "over"
                  ? `+${clockText(box.overtimeMs)}`
                  : clockText(time.ms)}
            </span>
            <div className="nodrag nopan -mr-1.5 flex items-center">
              {box.status === "idle" &&
                (paused ? (
                  <IconButton label="Resume" onClick={actions.resumeClock} overlay={flow}>
                    <Play />
                  </IconButton>
                ) : (
                  <IconButton
                    label={`Start a ${countdownText(nextFlipMs)} timebox`}
                    onClick={() => actions.startTimebox(nextFlipMs)}
                    overlay={flow}
                  >
                    <Hourglass />
                  </IconButton>
                ))}
              {box.status === "running" && (
                <IconButton label="Add a minute" onClick={actions.extendTimebox} overlay={flow}>
                  <Plus />
                </IconButton>
              )}
              {box.status === "over" && (
                <IconButton label="Flip again" onClick={() => actions.startTimebox(nextFlipMs)} overlay={flow}>
                  <RotateCcw />
                </IconButton>
              )}
            </div>
          </div>
          {paused ? (
            <p className="mt-0.5 h-4 text-[11px] leading-4 text-gray-400 dark:text-gray-500">Paused for a break</p>
          ) : (
            <div className="nodrag nopan mt-0.5 flex h-4 gap-px">
              {time.ms === 0 ? (
                <TimeTip className="flex flex-1 flex-col justify-center" content="Starts with the round">
                  <div className="h-1 rounded-full bg-gray-100 dark:bg-surface-2" />
                </TimeTip>
              ) : (
                <>
                  <TimeTip
                    className="flex min-w-1 flex-col justify-center"
                    style={{ flexGrow: time.votingMs, flexBasis: 0 }}
                    content={<TimeLine label="Voting" ms={time.votingMs} />}
                  >
                    <div className="h-1 rounded-full bg-blue-500" />
                  </TimeTip>
                  {time.discussionMs > 0 && (
                    <TimeTip
                      className="flex min-w-1 flex-col justify-center"
                      style={{ flexGrow: time.discussionMs, flexBasis: 0 }}
                      content={<TimeLine label="Discussion" ms={time.discussionMs} />}
                    >
                      <div className="h-1 rounded-full bg-emerald-500" />
                    </TimeTip>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        {box.status !== "idle" && (
          <>
            <ContextMenuItem onClick={actions.stopTimebox} disabled={!gameFlow.allowed}>
              Stop timebox
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuRadioGroup value={nextFlipMs} onValueChange={(ms: number) => actions.startTimebox(ms)}>
          {TIMEBOX_PRESETS_MS.map((ms) => (
            <ContextMenuRadioItem key={ms} value={ms} disabled={!gameFlow.allowed} closeOnClick>
              {ms / 60_000}-minute timebox
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        {paused ? (
          <ContextMenuItem onClick={actions.resumeClock} disabled={!gameFlow.allowed}>
            Resume
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={actions.pauseClock} disabled={!gameFlow.allowed}>
            Pause for a break
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => actions.setTimeNodeShown("timer", false)} disabled={!roomSettings.allowed}>
          Hide timer
        </ContextMenuItem>
        <p className="px-1.5 py-1 text-xs text-muted-foreground">Time is tracked either way.</p>
      </ContextMenuContent>
    </ContextMenu>
  );
});

RoundTimerNode.displayName = "RoundTimerNode";
