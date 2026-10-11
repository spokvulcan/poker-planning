"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { DoorOpen, Eye } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { RoomUserData } from "@/convex/model/memberships";
import { rulesOf } from "@/convex/ceremony";
import { runAct } from "@/lib/run-act";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The viewer's seat: the items the account menu offers, and the dialog that
 * confirms leaving, which the board draws once, outside the menu, so it
 * outlives the menu closing (the chrome can draw the menu twice, in its
 * phone sheet and its desktop bar).
 */
export interface Seat {
  items: ReactNode;
  dialog: ReactNode;
}

/**
 * The viewer's seat in this room, for the account menu's slot: sitting out
 * as a spectator and coming back, where the ceremony has spectators, and
 * leaving the room. The board builds it from what it already holds (the
 * roster and its ceremony's rules), so the account menu knows nothing of
 * rooms and opens no read of its own. Sitting out is the voting round's
 * business (ADR-0004) and leaving can lock the room's owner controls
 * (lockdown, ADR-0001); either way a refusal reaches the person in the
 * server's own words (runAct). Nothing while the viewer isn't seated.
 */
export function useSeatControls({
  roomId,
  room,
  me,
}: {
  roomId: Id<"rooms">;
  room: Doc<"rooms">;
  /** The viewer's place on the room's roster. */
  me: RoomUserData | undefined;
}): Seat | undefined {
  const edit = useMutation(api.users.edit);
  const leave = useMutation(api.users.leave);
  const [leaving, setLeaving] = useState(false);
  if (!me) return undefined;

  const { noun, spectators } = rulesOf(room);
  const sitOut = (isSpectator: boolean) =>
    void runAct(edit({ roomId, isSpectator }), "Your seat didn't change. Try again.");

  return {
    items: (
      <>
        {spectators && (
          <div
            data-testid="spectator-toggle-row"
            className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-white/10"
            onClick={() => sitOut(!me.isSpectator)}
          >
            <div className="flex items-center gap-2">
              <Eye className="size-4" />
              <span className="text-sm">Spectator</span>
            </div>
            <Switch
              checked={me.isSpectator}
              onCheckedChange={sitOut}
              size="sm"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}
        <DropdownMenuItem data-testid="leave-room" onClick={() => setLeaving(true)}>
          <DoorOpen className="mr-2 size-4" />
          Leave {noun.toLowerCase()}
        </DropdownMenuItem>
      </>
    ),
    dialog: (
      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this {noun.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              {me.role === "owner"
                ? `You own it: what only its owner can do stays locked until you come back. Its link brings you back any time.`
                : `Its link brings you back any time.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void runAct(leave({ roomId }), `You're still in the ${noun.toLowerCase()}. Try again.`)}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  };
}
