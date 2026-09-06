import Link from "next/link";
import { format } from "date-fns";
import { StagePill } from "./stage-pill";
import {
  ATTRIBUTION_LABELS,
  COLLECT_HINT_NO_CARD,
  collectUntilLine,
  coverageFacts,
  createdOn,
  historyRowCounts,
} from "@/convex/retroCopy";
import type { HistoryRow } from "@/convex/model/retro";

interface HistoryRowsProps {
  rows: HistoryRow[];
}

/**
 * The history row (spec §17, ADR-0024), one component for the team page's
 * history and `/dashboard/retros`: name and created date; format name,
 * attribution and resting stage; the coverage facts when a walk exists;
 * this retro's action counts as plain text with a unit. No card count, no
 * last-active time, no per-person figure, no colour by value, and the one
 * link is the row itself, to the board. The cards-due date and the
 * viewer's own "You haven't added a card yet" (spec §16.5) ride on the
 * `collect` rows.
 */
export function HistoryRows({ rows }: HistoryRowsProps) {
  return (
    <ul className="divide-y rounded-lg border" data-testid="retro-rows">
      {rows.map((row) => (
        <li key={row.roomId} data-testid="retro-row" data-stage={row.stageKind}>
          <Link
            href={`/room/${row.roomId}`}
            className="flex flex-col gap-1 px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-surface-3/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <span className="min-w-0 space-y-0.5">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-sm font-medium">{row.name}</span>
                <StagePill kind={row.stageKind} />
              </span>
              <span className="block text-xs text-muted-foreground">
                {createdOn(format(row.createdAt, "d MMM yyyy"))} · {row.formatName} ·{" "}
                {ATTRIBUTION_LABELS[row.attribution]}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {row.noCardYet && (
                <span data-testid="no-card-hint" className="text-amber-700 dark:text-status-warning-fg">
                  {COLLECT_HINT_NO_CARD}
                </span>
              )}
              {row.collectUntil !== undefined && <span>{collectUntilLine(format(row.collectUntil, "d MMM"))}</span>}
              {row.coverage && (
                <span data-testid="coverage-facts">{coverageFacts(row.coverage.covered, row.coverage.total)}</span>
              )}
              <span data-testid="action-counts" className="tabular-nums">
                {historyRowCounts(row.counts.open, row.counts.done, row.counts.dropped)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
