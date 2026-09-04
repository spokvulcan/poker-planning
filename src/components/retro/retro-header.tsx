import { format } from "date-fns";
import { StagePill } from "./stage-pill";
import { TEAMLESS_DISCLOSURE, collectUntilLine } from "@/convex/retroCopy";
import type { StageKind } from "@/convex/model/retroFormats";

interface RetroHeaderProps {
  name: string;
  stageKind: StageKind;
  /** Advisory cards-due date (ADR-0020); shown, never enforced. */
  collectUntil?: number;
}

/**
 * The board header (spec §5, §19): the retro's name, the stage pill and the
 * write-time disclosure, read before the first card is typed. A teamless
 * retro carries the teamless line; the team line and its link to the team
 * page arrive with team retros (#289).
 */
export function RetroHeader({ name, stageKind, collectUntil }: RetroHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-white px-4 py-2 dark:bg-surface-1">
      <h1 className="truncate text-base font-semibold">{name}</h1>
      <StagePill kind={stageKind} />
      {collectUntil !== undefined && (
        <span data-testid="collect-until" className="text-sm text-muted-foreground">
          {collectUntilLine(format(collectUntil, "d MMM"))}
        </span>
      )}
      <p className="basis-full text-xs text-muted-foreground sm:ml-auto sm:basis-auto">
        {TEAMLESS_DISCLOSURE}
      </p>
    </header>
  );
}
