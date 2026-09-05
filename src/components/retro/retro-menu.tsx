"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { MoreHorizontal } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { resolve, type MemberRole, type TeamRole } from "@/convex/permissions";
import {
  ADOPT_BUTTON,
  ADOPT_DESCRIPTION,
  ADOPT_FAILED,
  ADOPT_MENU_ITEM,
  ADOPT_TITLE,
  CLAIMED,
  CLAIM_FAILED,
  CLAIM_MENU_ITEM,
  DELETE_BUTTON,
  DELETE_FAILED,
  DELETE_MENU_ITEM,
  DELETE_TITLE,
  DELETING_BUTTON,
  RETRO_DELETED,
  TEAM_LABEL,
  deleteRetroConfirm,
  keptByTeam,
} from "@/convex/retroCopy";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import type { RetroTeam } from "./retro-header";

/** One of the viewer's Teams, as `teams.listMine` returns it. */
export interface MyTeam {
  _id: Id<"teams">;
  name: string;
  role: TeamRole;
}

interface RetroMenuProps {
  roomId: Id<"rooms">;
  /** The Team that keeps the retro; undefined for a teamless one. */
  team?: RetroTeam;
  /** The viewer's room role. */
  role: MemberRole;
  isOwnerAbsent: boolean;
  /** The viewer's Teams; empty for an anonymous account. */
  myTeams: MyTeam[];
}

/**
 * The board header's menu (spec §4.3, §5, §15.2): the owner's *Delete
 * retro* behind the counted confirmation; *Claim ownership* for a team
 * admin who is not the owner (the server decides `owner-present`); *Keep
 * with a team…* for the owner of a teamless retro who has a Team to give it
 * to. Every item is a mutation on room-owned state, so the menu renders
 * only for an attendee.
 */
export function RetroMenu({ roomId, team, role, isOwnerAbsent, myTeams }: RetroMenuProps) {
  const router = useRouter();
  const remove = useMutation(api.retro.remove);
  const claim = useMutation(api.retro.claim);
  const adopt = useMutation(api.retro.adoptIntoTeam);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [adoptTeamId, setAdoptTeamId] = useState<string>("");
  const [isAdopting, setIsAdopting] = useState(false);

  const counts = useQuery(api.retro.deleteCounts, confirmDelete ? { roomId } : "skip");

  // The same decision the guard makes (ADR-0013): visible-but-disabled with
  // the denial copy, never vanished. `permissions` are irrelevant to an
  // owner-only verb; the poker defaults satisfy the type.
  const deleteDecision = resolve(
    { kind: "relationship", verb: "delete" },
    { actorRole: role, permissions: { stageFlow: "owner", cardManagement: "owner", actionManagement: "owner", retroSettings: "owner" }, ownerAbsent: isOwnerAbsent, ownerInTeam: false }
  );
  const myTeamRole = team ? myTeams.find((t) => t._id === team._id)?.role : undefined;
  const canClaim = team !== undefined && myTeamRole === "admin" && role !== "owner";
  const canAdopt = team === undefined && role === "owner" && myTeams.length > 0;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await remove({ roomId });
      toast.success(RETRO_DELETED);
      router.push(team ? `/team/${team._id}` : "/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : DELETE_FAILED);
      setIsDeleting(false);
    }
  };

  const handleClaim = async () => {
    try {
      await claim({ roomId });
      toast.success(CLAIMED);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : CLAIM_FAILED);
    }
  };

  const handleAdopt = async () => {
    const target = myTeams.find((t) => t._id === adoptTeamId);
    if (!target) return;
    setIsAdopting(true);
    try {
      await adopt({ roomId, teamId: target._id });
      setAdoptOpen(false);
      toast.success(keptByTeam(target.name));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : ADOPT_FAILED);
    } finally {
      setIsAdopting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-xs" aria-label="Retro menu" />}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canAdopt && (
            <DropdownMenuItem onClick={() => setAdoptOpen(true)}>{ADOPT_MENU_ITEM}</DropdownMenuItem>
          )}
          {canClaim && <DropdownMenuItem onClick={handleClaim}>{CLAIM_MENU_ITEM}</DropdownMenuItem>}
          <DropdownMenuItem
            variant="destructive"
            disabled={!deleteDecision.allowed}
            title={deleteDecision.allowed ? undefined : deleteDecision.message}
            onClick={() => setConfirmDelete(true)}
          >
            {DELETE_MENU_ITEM}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={(open) => !isDeleting && setConfirmDelete(open)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{DELETE_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>
              {counts ? deleteRetroConfirm(counts.cards, counts.openActions) : "Counting…"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || counts === undefined}
            >
              {isDeleting ? DELETING_BUTTON : DELETE_BUTTON}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={adoptOpen} onOpenChange={(open) => !isAdopting && setAdoptOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{ADOPT_TITLE}</DialogTitle>
            <DialogDescription>{ADOPT_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="adopt-team">{TEAM_LABEL}</Label>
            <select
              id="adopt-team"
              value={adoptTeamId}
              onChange={(e) => setAdoptTeamId(e.target.value)}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
            >
              <option value="">Choose a team</option>
              {myTeams.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAdoptOpen(false)} disabled={isAdopting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAdopt} disabled={!adoptTeamId || isAdopting}>
              {ADOPT_BUTTON}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
