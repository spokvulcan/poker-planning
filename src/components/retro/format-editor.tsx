"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  RETRO_TINTS,
  type StageEntry,
  type StageKind,
  type StampedFormat,
  type Visibility,
} from "@/convex/model/retroFormats";
import {
  ADD_PROMPT,
  ADD_STAGE,
  CURRENT_STAGE_TAG,
  FORMAT_NAME_LABEL,
  PROMPTS_TITLE,
  PROMPT_HINT_FIELD,
  PROMPT_HINT_PLACEHOLDER,
  PROMPT_LABEL_FIELD,
  STAGES_TITLE,
  STAGE_LABELS,
  TINT_FIELD,
  cardsHiddenIn,
  cardsVisibleIn,
  moveStageDownLabel,
  moveStageUpLabel,
  removePromptLabel,
  removeStageLabel,
} from "@/convex/retroCopy";
import { RESOLVED_ALLOWED, type ResolvedDecision } from "@/convex/permissions";
import { permissionInputProps, permissionProps } from "@/hooks/usePermissions";
import { tintClasses } from "./tints";
import { canAddPrompt, canAddStage, canRemovePrompt, isStageLocked, movedOrder, type FormatDraft, type PromptDraftEdit } from "./format-draft";

/** What the editor does when a person edits; the create form reduces a draft, the settings dialog calls mutations. */
export interface FormatEditorActions {
  /** Offered pre-stamp only: a running retro's format name is user-facing history. */
  onRenameFormat?: (name: string) => void;
  onUpdatePrompt: (promptId: string, edit: PromptDraftEdit) => void;
  onAddPrompt: () => void;
  onRemovePrompt: (promptId: string) => void;
  onAddStage: (kind: StageKind) => void;
  onRemoveStage: (stageId: string) => void;
  onReorderStages: (stageIds: string[]) => void;
  /** Offered pre-stamp only: on a running retro the reveal toggle is the stageFlow act on the pill. */
  onSetCardsVisible?: (stageId: string, value: Visibility) => void;
}

interface FormatEditorProps extends FormatEditorActions {
  draft: FormatDraft;
  /** The running retro's shared pointer, which locks its entry; absent on the create form. */
  currentStageId?: string;
  /** Whether a prompt's tint may change: the create form's choice (spec §6.1), never a running retro's. */
  canEditTint?: boolean;
  /** The `retroSettings` decision: denied renders every control disabled with the copy. */
  decision?: ResolvedDecision;
}

const STAGE_KINDS: StageKind[] = ["collect", "review", "group", "vote", "discuss", "close"];

/**
 * The format editor (ADR-0021): prompts (label, hint, tint; add up to ten;
 * remove) and the stage list (add, remove, reorder except collect, discuss
 * and the current entry). One component for the create form and the
 * running retro's settings; the locks are the same rules the server keeps.
 */
export function FormatEditor({
  draft,
  currentStageId,
  canEditTint = false,
  decision = RESOLVED_ALLOWED,
  ...actions
}: FormatEditorProps) {
  const disabled = !decision.allowed;
  const deny = permissionProps(decision);
  const denyInput = permissionInputProps(decision);
  const [newKind, setNewKind] = useState<StageKind>("group");

  return (
    <div data-testid="format-editor" className="space-y-4">
      {actions.onRenameFormat && (
        <div className="space-y-1">
          <label htmlFor="format-name" className="text-xs font-medium">
            {FORMAT_NAME_LABEL}
          </label>
          <Input
            id="format-name"
            value={draft.format.name}
            maxLength={60}
            onChange={(e) => actions.onRenameFormat?.(e.target.value)}
            {...denyInput}
          />
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-medium">{PROMPTS_TITLE}</h3>
        <ul className="space-y-2">
          {draft.format.prompts.map((prompt) => (
            <PromptRow
              key={prompt.id}
              prompt={prompt}
              canRemove={canRemovePrompt(draft)}
              canEditTint={canEditTint}
              decision={decision}
              onUpdate={(edit) => actions.onUpdatePrompt(prompt.id, edit)}
              onRemove={() => actions.onRemovePrompt(prompt.id)}
            />
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={actions.onAddPrompt}
          disabled={!canAddPrompt(draft)}
          {...deny}
        >
          <Plus className="size-4" />
          {ADD_PROMPT}
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium">{STAGES_TITLE}</h3>
        <ul className="space-y-1">
          {draft.stages.map((stage) => {
            const label = STAGE_LABELS[stage.kind];
            const locked = isStageLocked(draft.stages, stage.id, currentStageId);
            const up = movedOrder(draft.stages, stage.id, -1, currentStageId);
            const down = movedOrder(draft.stages, stage.id, 1, currentStageId);
            return (
              <li
                key={stage.id}
                data-testid="stage-row"
                data-kind={stage.kind}
                data-current={String(stage.id === currentStageId)}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {label}
                  {stage.id === currentStageId && (
                    <span className="ml-1.5 text-xs text-muted-foreground">({CURRENT_STAGE_TAG})</span>
                  )}
                </span>
                {stage.kind === "collect" && actions.onSetCardsVisible && (
                  <CollectVisibilityToggle stage={stage} label={label} decision={decision} onSet={actions.onSetCardsVisible} />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={moveStageUpLabel(label)}
                  disabled={up === null}
                  onClick={() => up && actions.onReorderStages(up)}
                  {...deny}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={moveStageDownLabel(label)}
                  disabled={down === null}
                  onClick={() => down && actions.onReorderStages(down)}
                  {...deny}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={removeStageLabel(label)}
                  disabled={locked}
                  onClick={() => actions.onRemoveStage(stage.id)}
                  {...deny}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2">
          <select
            aria-label={ADD_STAGE}
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as StageKind)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            disabled={disabled}
            title={decision.allowed ? undefined : decision.message}
          >
            {STAGE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {STAGE_LABELS[kind]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => actions.onAddStage(newKind)}
            disabled={!canAddStage(draft)}
            {...deny}
          >
            <Plus className="size-4" />
            {ADD_STAGE}
          </Button>
        </div>
      </section>
    </div>
  );
}

function CollectVisibilityToggle({
  stage,
  label,
  decision,
  onSet,
}: {
  stage: StageEntry;
  label: string;
  decision: ResolvedDecision;
  onSet: (stageId: string, value: Visibility) => void;
}) {
  const hidden = stage.cardsVisible === "hidden";
  const text = hidden ? cardsHiddenIn(label) : cardsVisibleIn(label);
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-label={text}
      title={text}
      onClick={() => onSet(stage.id, hidden ? "visible" : "hidden")}
      {...permissionProps(decision)}
    >
      {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      <span className="text-xs">{hidden ? "hidden" : "visible"}</span>
    </Button>
  );
}

/** One prompt: label and hint commit on blur; the tint, when editable, commits at once. */
function PromptRow({
  prompt,
  canRemove,
  canEditTint,
  decision,
  onUpdate,
  onRemove,
}: {
  prompt: StampedFormat["prompts"][number];
  canRemove: boolean;
  canEditTint: boolean;
  decision: ResolvedDecision;
  onUpdate: (edit: PromptDraftEdit) => void;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(prompt.label);
  const [hint, setHint] = useState(prompt.hint ?? "");
  const denyInput = permissionInputProps(decision);
  const tint = tintClasses(prompt.color);
  return (
    <li className={cn("flex flex-wrap items-center gap-2 rounded-md border p-2", tint.zone)}>
      <Input
        aria-label={PROMPT_LABEL_FIELD}
        value={label}
        maxLength={80}
        className="h-8 min-w-40 flex-1 bg-white/70 dark:bg-surface-1/70"
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          const trimmed = label.trim();
          if (!trimmed) setLabel(prompt.label);
          else if (trimmed !== prompt.label) onUpdate({ label: trimmed });
        }}
        {...denyInput}
      />
      <Input
        aria-label={PROMPT_HINT_FIELD}
        placeholder={PROMPT_HINT_PLACEHOLDER}
        value={hint}
        maxLength={160}
        className="h-8 min-w-48 flex-[2] bg-white/70 dark:bg-surface-1/70"
        onChange={(e) => setHint(e.target.value)}
        onBlur={() => {
          if (hint.trim() !== (prompt.hint ?? "")) onUpdate({ hint: hint.trim() });
        }}
        {...denyInput}
      />
      {canEditTint && (
        <select
          aria-label={TINT_FIELD}
          value={prompt.color}
          onChange={(e) => onUpdate({ color: e.target.value })}
          className={cn("h-8 rounded-lg border border-input bg-white/70 px-2 text-sm capitalize dark:bg-surface-1/70", tint.label)}
          disabled={!decision.allowed}
          title={decision.allowed ? undefined : decision.message}
        >
          {RETRO_TINTS.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={removePromptLabel(prompt.label)}
        disabled={!canRemove}
        onClick={onRemove}
        {...permissionProps(decision)}
      >
        <X className="size-3.5" />
      </Button>
    </li>
  );
}
