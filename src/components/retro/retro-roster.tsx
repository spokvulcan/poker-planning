"use client";

import { useMemo } from "react";
import type { StageEntry } from "@/convex/model/retroFormats";
import type { UserWithPresence } from "@/hooks/useRoomPresence";
import { UserAvatar } from "@/components/user-menu/user-avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { READY_LABEL, READY_TOGGLE_LABEL, ROSTER_TITLE } from "@/convex/retroCopy";
import { projectRoster } from "./readiness";

interface RetroRosterProps {
  /** The members with presence merged on; offline while presence loads. */
  users: readonly UserWithPresence[];
  currentStage: Pick<StageEntry, "id" | "kind">;
  /** The viewer, when attending; a Team reader has no row and no toggle. */
  myUserId?: string;
  /** The viewer's readiness write: one call per state change. */
  onSetReady?: (ready: boolean) => void;
}

/**
 * The roster panel (spec §7): presence and names for every member, with
 * readiness named per person and the viewer's own toggle. `collect` offers
 * none — there the only signal is whether a person has written, which the
 * cards ticket adds — so nothing durable ever records who declared
 * themselves finished.
 */
export function RetroRoster({ users, currentStage, myUserId, onSetReady }: RetroRosterProps) {
  const rows = useMemo(() => projectRoster(users, currentStage.id), [users, currentStage.id]);
  const offersReadiness = currentStage.kind !== "collect";
  const me = rows.find((row) => row._id === myUserId);

  return (
    <section data-testid="retro-roster" aria-label={ROSTER_TITLE} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{ROSTER_TITLE}</h2>
      {offersReadiness && me && onSetReady && (
        <div className="flex items-center gap-2">
          <Switch
            id="my-readiness"
            checked={me.ready}
            onCheckedChange={(checked) => onSetReady(checked)}
            aria-label={READY_TOGGLE_LABEL}
          />
          <Label htmlFor="my-readiness">{READY_TOGGLE_LABEL}</Label>
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li
            key={row._id}
            data-online={String(row.isOnline)}
            {...(offersReadiness ? { "data-ready": String(row.ready) } : {})}
            className="flex items-center gap-2 text-sm"
          >
            <UserAvatar
              name={row.name}
              avatarUrl={row.avatarUrl}
              size="sm"
              className={cn("ring-2", row.isOnline ? "ring-green-500" : "ring-gray-400 grayscale")}
            />
            <span className={cn("min-w-0 flex-1 truncate", !row.isOnline && "text-muted-foreground")}>
              {row.name}
            </span>
            {offersReadiness && row.ready && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:bg-status-success-bg dark:text-status-success-fg">
                {READY_LABEL}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
