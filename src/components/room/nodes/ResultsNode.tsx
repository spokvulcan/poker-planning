"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { ReactElement, memo, useMemo } from "react";

import { cn } from "@/lib/utils";
import { summarize } from "@/convex/summarize";
import type { ResultsNodeType } from "../types";

export const ResultsNode = memo(
  ({ data, selected }: NodeProps<ResultsNodeType>): ReactElement => {
    const { votes, isNumericScale } = data;

    // One shared summary (same as the backend snapshot/export) — so the live
    // numbers can never diverge from the stored ones. Special cards are excluded
    // from agreement here exactly as on the backend.
    const { average, median, agreement, voteGroups, totalVotes } = useMemo(() => {
      const summary = summarize(votes, { isNumeric: isNumericScale });
      return {
        average: summary.stats.average,
        median: summary.stats.median,
        agreement: summary.stats.agreement,
        voteGroups: summary.distribution,
        totalVotes: summary.distribution.reduce((n, d) => n + d.count, 0),
      };
    }, [votes, isNumericScale]);

    // Empty state
    if (totalVotes === 0) {
      return (
        <div className="relative">
          <Handle
            type="target"
            position={Position.Left}
            id="left"
            className="bg-gray-400! dark:bg-surface-3!"
            aria-hidden="true"
          />
          <div className={cn(
            "p-3 bg-white dark:bg-surface-1 rounded-lg shadow-md border border-gray-200 dark:border-border",
            selected && "ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-surface-1"
          )}>
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full bg-gray-400"
                aria-hidden="true"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                No votes yet
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative">
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          className="bg-gray-400! dark:bg-surface-3!"
          aria-hidden="true"
        />
        <div className={cn(
          "p-3 bg-white dark:bg-surface-1 rounded-lg shadow-md border border-gray-200 dark:border-border",
          selected && "ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-surface-1"
        )}>
          <div className="flex items-center gap-4">
            {/* Status indicator */}
            <div
              className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400"
              aria-hidden="true"
            />

            {/* Average display - only for numeric scales */}
            {isNumericScale && (
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Avg
                </span>
                <span className="text-lg font-mono font-medium text-gray-700 dark:text-gray-300">
                  {average !== null ? average.toFixed(1) : "—"}
                </span>
              </div>
            )}

            {/* Median display - only for numeric scales */}
            {isNumericScale && (
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Med
                </span>
                <span className="text-lg font-mono font-medium text-gray-700 dark:text-gray-300">
                  {median !== null ? median.toFixed(1) : "—"}
                </span>
              </div>
            )}

            {/* Agreement display */}
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Agree
              </span>
              <span
                className={cn(
                  "text-lg font-mono font-medium",
                  agreement > 80
                    ? "text-green-600 dark:text-green-400"
                    : agreement >= 60
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-gray-700 dark:text-gray-300"
                )}
              >
                {agreement}%
              </span>
            </div>

            {/* Simplified distribution bars */}
            <div className="flex-1 flex flex-col gap-0.5 min-w-24">
              {voteGroups.map(({ label, count }) => {
                const percentage = (count / totalVotes) * 100;
                return (
                  <div key={label} className="flex items-center gap-1.5 h-4">
                    <span className="w-5 text-xs text-right text-gray-600 dark:text-gray-400 font-medium">
                      {label}
                    </span>
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded">
                      <div
                        className="h-full bg-gray-400 dark:bg-gray-500 rounded"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="w-4 text-xs text-gray-500 dark:text-gray-400">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ResultsNode.displayName = "ResultsNode";
