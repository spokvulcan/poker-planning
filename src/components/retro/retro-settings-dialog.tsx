"use client";

import { useState } from "react";
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
import { runAct } from "@/lib/run-act";
import { permissionInputProps, permissionProps } from "@/hooks/usePermissions";
import {
  COLLECT_UNTIL_DESCRIPTION,
  COLLECT_UNTIL_LABEL,
  JOIN_POLICY_LABEL,
  JOIN_POLICY_OPTIONS,
  NEW_PROMPT_LABEL,
  RETRO_NAME_LABEL,
  SETTINGS_DESCRIPTION,
  SETTINGS_FAILED,
  SETTINGS_TITLE,
} from "@/convex/retroCopy";
import { FormatEditor } from "./format-editor";
import { nextTint } from "./format-draft";
import { parseCollectUntil } from "./collect-until";

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

  const deny = permissionProps(decision);
  const denyInput = permissionInputProps(decision);
  const run = (act: Promise<unknown>) => void runAct(act, SETTINGS_FAILED);
  const [nameDraft, setNameDraft] = useState(name);
  const dueValue = retro.collectUntil === undefined ? "" : formatDate(retro.collectUntil, "yyyy-MM-dd");
  // Drafted locally so the field reads what was typed until the write lands.
  const [dueDraft, setDueDraft] = useState(dueValue);

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
                if (!decision.allowed || !trimmed || trimmed === name) {
                  setNameDraft(name);
                  return;
                }
                run(rename({ roomId, name: trimmed }));
              }}
              {...denyInput}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-join-policy">{JOIN_POLICY_LABEL}</Label>
            <select
              id="settings-join-policy"
              value={joinPolicy}
              onChange={(e) => run(setJoinPolicy({ roomId, joinPolicy: e.target.value as JoinPolicy }))}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              {...deny}
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
              onChange={(e) => setDueDraft(e.target.value)}
              // Committed on blur, like the name: a date field fires change per segment.
              onBlur={() => {
                const due = parseCollectUntil(dueDraft);
                if (!decision.allowed || due === retro.collectUntil) return;
                run(setCollectUntil({ roomId, ...(due !== undefined ? { collectUntil: due } : {}) }));
              }}
              {...denyInput}
            />
            <p className="text-xs text-muted-foreground">{COLLECT_UNTIL_DESCRIPTION}</p>
          </div>
          <FormatEditor
            draft={{ format: retro.format, stages: retro.stages }}
            currentStageId={retro.currentStageId}
            decision={decision}
            onUpdatePrompt={(promptId, edit) => run(updatePrompt({ roomId, promptId, ...edit }))}
            onAddPrompt={() =>
              run(addPrompt({ roomId, label: NEW_PROMPT_LABEL, color: nextTint(retro.format.prompts) }))
            }
            onRemovePrompt={(promptId) => run(removePrompt({ roomId, promptId }))}
            onAddStage={(kind) => run(addStage({ roomId, kind }))}
            onRemoveStage={(stageId) => run(removeStage({ roomId, stageId }))}
            onReorderStages={(stageIds) => run(reorderStages({ roomId, stageIds }))}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
