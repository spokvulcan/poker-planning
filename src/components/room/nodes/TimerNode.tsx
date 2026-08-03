"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { ReactElement, memo, useCallback } from "react";

import { cn } from "@/lib/utils";
import { useTimerSync } from "../hooks/use-timer-sync";
import type { TimerNodeType } from "../types";

export const TimerNode = memo(
  ({ data, selected }: NodeProps<TimerNodeType>): ReactElement => {
    // Extract required data for useTimerSync hook
    const { roomId, userId, nodeId } = data;

    // Timer state comes from the node data itself (delivered by
    // api.canvas.getCanvasNodes); the hook adds local ticking and controls.
    const {
      displayTime,
      isRunning,
      currentSeconds,
      onStart,
      onPause,
      onReset,
      error,
    } = useTimerSync({
      roomId,
      nodeId: nodeId || "timer", // fallback to default timer nodeId
      userId,
      timerState: data,
    });

    // Handle toggle between start and pause
    const handleToggle = useCallback(() => {
      if (isRunning) {
        onPause();
      } else {
        onStart();
      }
    }, [isRunning, onStart, onPause]);

    // Use the onReset function from the hook
    const handleReset = useCallback(() => {
      onReset();
    }, [onReset]);

    return (
      <div className="relative">
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className="bg-gray-400! dark:bg-surface-3!"
          aria-hidden="true"
        />
        <div className={cn(
          "p-3 bg-white dark:bg-surface-1 rounded-lg shadow-md border border-gray-200 dark:border-border",
          selected && "ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-surface-1"
        )}>
          {error && (
            <div className="mb-2 text-xs text-red-500 dark:text-red-400">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                isRunning ? "bg-red-500 animate-pulse" : "bg-gray-400"
              )}
              aria-hidden="true"
            />
            <span className="text-lg font-mono font-medium text-gray-700 dark:text-gray-300 min-w-16">
              {displayTime}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleToggle}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label={isRunning ? "Pause timer" : "Start timer"}
                disabled={!!error}
              >
                {isRunning ? (
                  <Pause className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                ) : (
                  <Play className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                )}
              </button>
              <button
                onClick={handleReset}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Reset timer"
                disabled={currentSeconds === 0 && !isRunning}
              >
                <RotateCcw
                  className={cn(
                    "h-4 w-4",
                    currentSeconds === 0 && !isRunning
                      ? "text-gray-400 dark:text-gray-600"
                      : "text-gray-600 dark:text-gray-400"
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

TimerNode.displayName = "TimerNode";
