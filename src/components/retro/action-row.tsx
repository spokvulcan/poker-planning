"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionRead, ActionStatus } from "@/convex/model/retroActions";
import { MAX_ACTION_NOTE, MAX_ACTION_TEXT } from "@/convex/model/retroActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  ACTION_DELETE,
  ACTION_DONE,
  ACTION_DROP,
  ACTION_DUE_LABEL,
  ACTION_EDIT,
  ACTION_NOTE_LABEL,
  ACTION_NOTE_PLACEHOLDER,
  ACTION_OWNER_LABEL,
  ACTION_REOPEN,
  ACTION_SAVE,
  ACTION_SOURCE_LABEL,
  ACTION_STATUS_LABELS,
  ACTION_TEXT_LABEL,
  CANCEL_BUTTON,
  NO_OWNER_OPTION,
  OVERDUE,
  UNOWNED_ACTION,
  dueOn,
  fromRetro,
  ownedBy,
} from "@/convex/retroCopy";
import { formatDue, isOverdue, parseDueDate, toDateInput } from "./actions";

/** An attendee of the item's retro, as the owner picker lists them. */
export interface ActionMember {
  userId: Id<"users">;
  name: string;
}

/** The in-place acts, bound to the item's room by whoever renders the list. */
export interface ActionRowActions {
  onSetStatus: (actionId: Id<"retroActions">, status: ActionStatus, note?: string) => void;
  onEdit: (actionId: Id<"retroActions">, text: string, dueAt: number | null) => void;
  onAssign: (actionId: Id<"retroActions">, ownerId: Id<"users"> | undefined) => void;
  onDelete: (actionId: Id<"retroActions">) => void;
}

export interface ActionRowProps {
  item: ActionRead;
  /** The item's retro's attendees: an owner must attend (spec §13). */
  members: readonly ActionMember[];
  /** The clock the overdue state reads; defaults to now. */
  now?: number;
  /** Name the retro the item lives in: the review and the team page. */
  showRoom?: boolean;
  /** Absent for a Team reader; present acts still show only under the item's rights. */
  actions?: ActionRowActions;
}

type Pending = { status: "done" | "dropped" } | { edit: true } | null;

/**
 * One action item (spec §13, §19; ADR-0017): text; the owner by name or
 * "Nobody owns this yet", a state and never an error; the due date, with
 * Overdue while open and past; the source's label, never an author; the
 * note once the item left open. With edit rights: done and drop, each
 * inviting a note, reopen, and an in-place edit of text and date. With
 * the category: the owner picker among the retro's attendees, and delete
 * behind a confirmation. No priority, no comments, no count copy.
 */
export function ActionRow({ item, members, now, showRoom = false, actions }: ActionRowProps) {
  // The clock is read once per mount when the caller passes none; overdue is a
  // rendering state and a re-read every render would be an impure render.
  const [mountedAt] = useState(() => Date.now());
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const [text, setText] = useState(item.text);
  const [due, setDue] = useState(toDateInput(item.dueAt));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const overdue = isOverdue(item, now ?? mountedAt);
  const canEdit = actions !== undefined && item.rights.edit;
  const canManage = actions !== undefined && item.rights.manage;

  const openEdit = () => {
    setText(item.text);
    setDue(toDateInput(item.dueAt));
    setPending({ edit: true });
  };
  const saveEdit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    actions!.onEdit(item._id, trimmed, parseDueDate(due) ?? null);
    setPending(null);
  };
  const saveStatus = (status: "done" | "dropped") => {
    const trimmed = note.trim();
    actions!.onSetStatus(item._id, status, trimmed === "" ? undefined : trimmed);
    setNote("");
    setPending(null);
  };

  return (
    <li
      data-testid="action-item"
      data-action-id={item._id}
      data-status={item.status}
      data-owned={String(item.ownerId !== undefined)}
      data-overdue={String(overdue)}
      className={cn(
        "flex flex-col gap-1.5 rounded-md border px-3 py-2 text-sm",
        item.status !== "open" && "bg-gray-50 text-muted-foreground dark:bg-surface-2"
      )}
    >
      {pending && "edit" in pending ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveEdit();
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor={`action-text-${item._id}`}>{ACTION_TEXT_LABEL}</Label>
            <Textarea
              id={`action-text-${item._id}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_ACTION_TEXT}
              rows={2}
              autoFocus
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`action-due-${item._id}`}>{ACTION_DUE_LABEL}</Label>
            <Input id={`action-due-${item._id}`} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="xs" onClick={() => setPending(null)}>
              {CANCEL_BUTTON}
            </Button>
            <Button type="submit" size="xs" disabled={!text.trim()}>
              {ACTION_SAVE}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <p className={cn("min-w-0 flex-1", item.status !== "open" && "line-through")}>{item.text}</p>
            {item.status !== "open" && (
              <span className="shrink-0 rounded-full border px-1.5 text-[10px] font-semibold uppercase">
                {ACTION_STATUS_LABELS[item.status]}
              </span>
            )}
            {overdue && (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 uppercase dark:bg-status-warning-bg dark:text-status-warning-fg">
                {OVERDUE}
              </span>
            )}
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={ACTION_DELETE}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {canManage ? (
              <label className="flex items-center gap-1">
                <span>{ACTION_OWNER_LABEL}</span>
                <select
                  aria-label={ACTION_OWNER_LABEL}
                  value={item.ownerId ?? ""}
                  onChange={(e) =>
                    actions!.onAssign(item._id, e.target.value === "" ? undefined : (e.target.value as Id<"users">))
                  }
                  className="h-6 rounded-md border border-input bg-transparent px-1 text-xs dark:bg-input/30"
                >
                  <option value="">{NO_OWNER_OPTION}</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                  {/* An owner no longer attending, or gone: keep the stored value selectable. */}
                  {item.ownerId !== undefined && !members.some((m) => m.userId === item.ownerId) && (
                    <option value={item.ownerId}>{item.ownerName}</option>
                  )}
                </select>
              </label>
            ) : (
              <span data-testid="action-owner">
                {item.ownerId !== undefined ? ownedBy(item.ownerName ?? "") : UNOWNED_ACTION}
              </span>
            )}
            {item.dueAt !== undefined && <span>{dueOn(formatDue(item.dueAt))}</span>}
            {item.source && (
              <span className="min-w-0 truncate" title={item.source.label}>
                {ACTION_SOURCE_LABEL}: {item.source.label}
              </span>
            )}
            {showRoom && <span>{fromRetro(item.roomName)}</span>}
          </div>
          {item.note !== undefined && item.status !== "open" && (
            <p className="text-xs italic text-muted-foreground">{item.note}</p>
          )}
          {pending && "status" in pending ? (
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveStatus(pending.status);
              }}
            >
              <div className="grid gap-1">
                <Label htmlFor={`action-note-${item._id}`}>{ACTION_NOTE_LABEL}</Label>
                <Textarea
                  id={`action-note-${item._id}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={ACTION_NOTE_PLACEHOLDER}
                  maxLength={MAX_ACTION_NOTE}
                  rows={2}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="xs" onClick={() => setPending(null)}>
                  {CANCEL_BUTTON}
                </Button>
                <Button type="submit" size="xs">
                  {ACTION_SAVE}
                </Button>
              </div>
            </form>
          ) : (
            canEdit && (
              <div className="flex flex-wrap gap-1">
                {item.status === "open" ? (
                  <>
                    <Button type="button" variant="outline" size="xs" onClick={() => setPending({ status: "done" })}>
                      {ACTION_DONE}
                    </Button>
                    <Button type="button" variant="outline" size="xs" onClick={() => setPending({ status: "dropped" })}>
                      {ACTION_DROP}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => actions!.onSetStatus(item._id, "open", undefined)}
                  >
                    {ACTION_REOPEN}
                  </Button>
                )}
                <Button type="button" variant="ghost" size="xs" onClick={openEdit}>
                  {ACTION_EDIT}
                </Button>
              </div>
            )
          )}
        </>
      )}
      {canManage && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{ACTION_DELETE}?</AlertDialogTitle>
              <AlertDialogDescription>{item.text}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{CANCEL_BUTTON}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setConfirmDelete(false);
                  actions!.onDelete(item._id);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
}
