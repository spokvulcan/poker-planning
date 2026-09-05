import Link from "next/link";
import { format } from "date-fns";
import { StagePill } from "./stage-pill";
import { COLLECT_HINT_NO_CARD, collectUntilLine } from "@/convex/retroCopy";
import type { RetroListRow } from "@/convex/model/retro";

interface RetroRowsProps {
  rows: RetroListRow[];
}

/**
 * The minimal listing row (spec §16.5): name and resting stage, with the
 * cards-due date while one is set and, in a named retro collecting cards,
 * the viewer's own "You haven't added a card yet", routing to the board.
 * Shared by the team page and `/dashboard/retros` until #299's history
 * row replaces it.
 */
export function RetroRows({ rows }: RetroRowsProps) {
  return (
    <ul className="divide-y rounded-lg border" data-testid="retro-rows">
      {rows.map((row) => (
        <li key={row.roomId} data-testid="retro-row" data-stage={row.stageKind}>
          <Link
            href={`/room/${row.roomId}`}
            className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-surface-3/50"
          >
            <span className="min-w-0 truncate text-sm font-medium">{row.name}</span>
            <span className="flex shrink-0 items-center gap-3">
              {row.noCardYet && (
                <span data-testid="no-card-hint" className="text-xs text-amber-700 dark:text-status-warning-fg">
                  {COLLECT_HINT_NO_CARD}
                </span>
              )}
              {row.collectUntil !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {collectUntilLine(format(row.collectUntil, "d MMM"))}
                </span>
              )}
              <StagePill kind={row.stageKind} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
