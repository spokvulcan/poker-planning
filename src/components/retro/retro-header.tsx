import type { ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { StagePill } from "./stage-pill";
import { TEAMLESS_DISCLOSURE, collectUntilLine, keptByTeam } from "@/convex/retroCopy";
import type { StageKind } from "@/convex/model/retroFormats";
import type { Id } from "@/convex/_generated/dataModel";

/** The owning Team as the board sees it: enough for the disclosure's link. */
export interface RetroTeam {
  _id: Id<"teams">;
  name: string;
}

interface RetroHeaderProps {
  name: string;
  stageKind: StageKind;
  /** Advisory cards-due date (ADR-0020); shown, never enforced. */
  collectUntil?: number;
  /** The Team that keeps the retro; undefined for a teamless one. */
  team?: RetroTeam;
  /** The header's menu (delete, claim, adopt), for attendees. */
  menu?: ReactNode;
}

/**
 * The board header (spec §5, §19): the retro's name, the stage pill and the
 * write-time disclosure, read before the first card is typed. A team retro
 * carries the team line, which doubles as the link to the team page
 * (ADR-0008); a teamless retro carries the teamless line.
 */
export function RetroHeader({ name, stageKind, collectUntil, team, menu }: RetroHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-white px-4 py-2 dark:bg-surface-1">
      <h1 className="truncate text-base font-semibold">{name}</h1>
      <StagePill kind={stageKind} />
      {collectUntil !== undefined && (
        <span data-testid="collect-until" className="text-sm text-muted-foreground">
          {collectUntilLine(format(collectUntil, "d MMM"))}
        </span>
      )}
      <p
        data-testid="disclosure"
        data-kept={team ? "team" : "none"}
        className="basis-full text-xs text-muted-foreground sm:ml-auto sm:basis-auto"
      >
        {team ? (
          <Link href={`/team/${team._id}`} className="underline-offset-4 hover:underline">
            {keptByTeam(team.name)}
          </Link>
        ) : (
          TEAMLESS_DISCLOSURE
        )}
      </p>
      {menu}
    </header>
  );
}
