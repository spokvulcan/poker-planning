"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { format as formatDate } from "date-fns";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { JoinPolicy, ResolvedDecision } from "@/convex/permissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import {
  COLLECT_UNTIL_DESCRIPTION,
  COLLECT_UNTIL_LABEL,
  JOIN_POLICY_LABEL,
  JOIN_POLICY_OPTIONS,
  RETRO_NAME_LABEL,
  SETTINGS_DESCRIPTION,
  SETTINGS_FAILED,
  SETTINGS_TITLE,
} from "@/convex/retroCopy";
import { FormatEditor } from "./format-editor";
import { nextTint, type FormatDraft } from "./format-draft";
import { NEW_PROMPT_LABEL } from "@/convex/retroCopy";

interface RetroSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: Id<"rooms">;
  /** The room shell's name and join policy. */
  name: string;
  joinPolicy: JoinPolicy;
  /** Whether a Team keeps the retro: `teamMembers` is offered only then. */
  hasTeam: boolean;
  retro: Doc<"retros">;
  /** The `retroSettings` decision: denied renders every control disabled with the copy. */
  decision: ResolvedDecision;
}

/** A `<input type="date">` value as the end of that local day, or undefined. */
function parseDate(value: string): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
}

/**
 * The running retro's settings (spec §6.4): rename, join policy, cards-due
 * date, and the format editor over the stamped prompts and stage list with
 * the shared pointer's entry locked. Every edit is one mutation, not
 * optimistic (spec §10.7); a refusal surfaces as its copy.
 */
export function RetroSettingsDialog({
  open,
  onOpenChange,
  roomId,
  name,
  joinPolicy,
  hasTeam,
  retro,
  decision,
}: RetroSettingsDialogProps) {
  const rename = useMutation(api.retro.rename);
  const setJoinPolicy = useMutation(api.retro.setJoinPolicy);
  const setCollectUntil = useMutation(api.retro.setCollectUntil);
  const updatePrompt = useMutation(api.retro.updatePrompt);
  const addPrompt = useMutation(api.retro.addPrompt);
  const removePrompt = useMutation(api.retro.removePrompt);
  const addStage = useMutation(api.retro.addStage);
  const removeStage = useMutation(api.retro.removeStage);
  const reorderStages = useMutation(api.retro.reorderStages);

  const denial = decision.allowed ? undefined : decision.message;
  const [nameDraft, setNameDraft] = useState(name);
  const dueValue = retro.collectUntil === undefined ? "" : formatDate(retro.collectUntil, "yyyy-MM-dd");
  // Drafted locally so the field reads what was typed until the write lands.
  const [dueDraft, setDueDraft] = useState(dueValue);

  const run = useCallback(async (act: Promise<unknown>) => {
    try {
      await act;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : SETTINGS_FAILED);
    }
  }, []);

  const draft = useMemo<FormatDraft>(
    () => ({ format: retro.format, stages: retro.stages }),
    [retro.format, retro.stages]
  );
  const policies = JOIN_POLICY_OPTIONS.filter((o) => hasTeam || o.value !== "teamMembers");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{SETTINGS_TITLE}</DialogTitle>
          <DialogDescription>{SETTINGS_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="settings-name">{RETRO_NAME_LABEL}</Label>
            <Input
              id="settings-name"
              value={nameDraft}
              maxLength={100}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                const trimmed = nameDraft.trim();
                if (denial || !trimmed || trimmed === name) {
                  setNameDraft(name);
                  return;
                }
                void run(rename({ roomId, name: trimmed }));
              }}
              {...(denial ? { readOnly: true, title: denial } : {})}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-join-policy">{JOIN_POLICY_LABEL}</Label>
            <select
              id="settings-join-policy"
              value={joinPolicy}
              onChange={(e) => void run(setJoinPolicy({ roomId, joinPolicy: e.target.value as JoinPolicy }))}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              disabled={denial !== undefined}
              title={denial}
            >
              {policies.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-collect-until">{COLLECT_UNTIL_LABEL}</Label>
            <Input
              id="settings-collect-until"
              type="date"
              value={dueDraft}
              onChange={(e) => {
                setDueDraft(e.target.value);
                const due = parseDate(e.target.value);
                void run(setCollectUntil({ roomId, ...(due !== undefined ? { collectUntil: due } : {}) }));
              }}
              {...(denial ? { readOnly: true, title: denial } : {})}
            />
            <p className="text-xs text-muted-foreground">{COLLECT_UNTIL_DESCRIPTION}</p>
          </div>
          <FormatEditor
            draft={draft}
            currentStageId={retro.currentStageId}
            denial={denial}
            onUpdatePrompt={(promptId, edit) => void run(updatePrompt({ roomId, promptId, ...edit }))}
            onAddPrompt={() =>
              void run(addPrompt({ roomId, label: NEW_PROMPT_LABEL, color: nextTint(retro.format.prompts) }))
            }
            onRemovePrompt={(promptId) => void run(removePrompt({ roomId, promptId }))}
            onAddStage={(kind) => void run(addStage({ roomId, kind }))}
            onRemoveStage={(stageId) => void run(removeStage({ roomId, stageId }))}
            onReorderStages={(stageIds) => void run(reorderStages({ roomId, stageIds }))}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
