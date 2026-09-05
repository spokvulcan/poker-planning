"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import type { TopicRef } from "@/convex/model/walk";
import { MAX_ACTION_TEXT } from "@/convex/model/retroActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ACTION_DUE_LABEL,
  ACTION_OWNER_LABEL,
  ACTION_SOURCE_LABEL,
  ACTION_SUBMIT,
  ACTION_TEXT_LABEL,
  ACTION_TEXT_PLACEHOLDER,
  CLEAR_SOURCE,
  UNOWNED_ACTION,
} from "@/convex/retroCopy";
import type { ActionMember } from "./action-row";
import { parseDueDate } from "./actions";
import type { CreateActionInput } from "./use-action-actions";

/** The topic an item is written against (spec §13): the walk's current topic, with its label. */
export interface ActionSource {
  ref: TopicRef;
  label: string;
}

export interface ActionComposerProps {
  members: readonly ActionMember[];
  /** Pre-filled by "Add action" on the walk's topic; cleared by the person. */
  source?: ActionSource;
  onClearSource?: () => void;
  /** Resolves to whether the item was written; the form clears on success. */
  onSubmit: (input: CreateActionInput) => Promise<boolean>;
}

/**
 * The inline composer (spec §13): text, zero or one owner among the
 * attendees, an optional date, and the source it answers when it came from
 * the walk. Never refused by a stage; the panel decides where it is
 * offered. Unowned is a fine way to save.
 */
export function ActionComposer({ members, source, onClearSource, onSubmit }: ActionComposerProps) {
  const [text, setText] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [due, setDue] = useState("");
  const [posting, setPosting] = useState(false);

  const post = async () => {
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    const dueAt = parseDueDate(due);
    const written = await onSubmit({
      text: trimmed,
      ...(ownerId ? { ownerId: ownerId as Id<"users"> } : {}),
      ...(dueAt !== undefined ? { dueAt } : {}),
      ...(source ? { source: source.ref } : {}),
    });
    setPosting(false);
    if (written) {
      setText("");
      setOwnerId("");
      setDue("");
      onClearSource?.();
    }
  };

  return (
    <form
      data-testid="action-composer"
      className="grid gap-2 rounded-md border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void post();
      }}
    >
      {source && (
        <p data-testid="action-source" className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {ACTION_SOURCE_LABEL}: {source.label}
          </span>
          {onClearSource && (
            <Button type="button" variant="ghost" size="icon-xs" aria-label={CLEAR_SOURCE} onClick={onClearSource}>
              <X className="size-3" />
            </Button>
          )}
        </p>
      )}
      <div className="grid gap-1">
        <Label htmlFor="action-composer-text">{ACTION_TEXT_LABEL}</Label>
        <Textarea
          id="action-composer-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={ACTION_TEXT_PLACEHOLDER}
          maxLength={MAX_ACTION_TEXT}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void post();
            }
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor="action-composer-owner">{ACTION_OWNER_LABEL}</Label>
          <select
            id="action-composer-owner"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="h-8 rounded-md border border-input bg-transparent px-1.5 text-xs dark:bg-input/30"
          >
            <option value="">{UNOWNED_ACTION}</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="action-composer-due">{ACTION_DUE_LABEL}</Label>
          <Input id="action-composer-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="xs" disabled={!text.trim() || posting}>
          {ACTION_SUBMIT}
        </Button>
      </div>
    </form>
  );
}
