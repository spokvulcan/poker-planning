import {
  isLockedKindEntry,
  MAX_PROMPTS,
  MAX_STAGES,
  newPromptId,
  newStageEntry,
  renumberPrompts,
  reorderKeepsLocks,
  RETRO_TINTS,
  seedStages,
  stampFormat,
  type FormatPrompt,
  type RetroFormat,
  type StageEntry,
  type StageKind,
  type StampedFormat,
  type Visibility,
} from "@/convex/model/retroFormats";
import { NEW_PROMPT_LABEL } from "@/convex/retroCopy";

/**
 * The create form's editable copy of a format (ADR-0021, spec §6.1): the
 * prompts and the stage list, edited before stamping. Pure reducers over a
 * plain value; every rule the server enforces at creation (the caps, the
 * collect/discuss locks) is refused here by returning the draft unchanged,
 * so the UI disables what would be refused. The shipped constant is copied
 * on the way in and never read again.
 */
export interface FormatDraft {
  format: StampedFormat;
  stages: StageEntry[];
}

/** A fresh draft from a library entry: its stamp and the standard seed. */
export function draftFromLibrary(entry: RetroFormat, options: { hasTeam: boolean }): FormatDraft {
  return { format: stampFormat(entry), stages: seedStages(entry, options) };
}

/**
 * A fresh draft from a stamped format (a Team's edited last format): its
 * prompts copied, and the standard seed for the stages, since a stamped
 * format carries no stage list of its own.
 */
export function draftFromStamped(format: StampedFormat, options: { hasTeam: boolean }): FormatDraft {
  return {
    format: { name: format.name, prompts: format.prompts.map((p) => ({ ...p })) },
    stages: seedStages({ collectVisible: false }, options),
  };
}

export function renameFormat(draft: FormatDraft, name: string): FormatDraft {
  return { ...draft, format: { ...draft.format, name } };
}

export interface PromptEdit {
  label?: string;
  hint?: string;
  color?: string;
}

export function updatePrompt(draft: FormatDraft, promptId: string, edit: PromptEdit): FormatDraft {
  return {
    ...draft,
    format: {
      ...draft.format,
      prompts: draft.format.prompts.map((p) => {
        if (p.id !== promptId) return p;
        const next: FormatPrompt = { ...p, ...(edit.label !== undefined ? { label: edit.label } : {}), ...(edit.color !== undefined ? { color: edit.color } : {}) };
        if (edit.hint !== undefined) {
          if (edit.hint.trim()) next.hint = edit.hint;
          else delete next.hint;
        }
        return next;
      }),
    },
  };
}

/** The first palette tint no prompt uses yet, else the first tint. */
export function nextTint(prompts: readonly FormatPrompt[]): string {
  const used = new Set(prompts.map((p) => p.color));
  return RETRO_TINTS.find((tint) => !used.has(tint)) ?? RETRO_TINTS[0];
}

export function canAddPrompt(draft: FormatDraft): boolean {
  return draft.format.prompts.length < MAX_PROMPTS;
}

export function addPrompt(draft: FormatDraft): FormatDraft {
  if (!canAddPrompt(draft)) return draft;
  const prompts = draft.format.prompts;
  const prompt: FormatPrompt = {
    id: newPromptId(),
    label: NEW_PROMPT_LABEL,
    color: nextTint(prompts),
    order: prompts.length,
  };
  return { ...draft, format: { ...draft.format, prompts: [...prompts, prompt] } };
}

export function canRemovePrompt(draft: FormatDraft): boolean {
  return draft.format.prompts.length > 1;
}

export function removePrompt(draft: FormatDraft, promptId: string): FormatDraft {
  if (!canRemovePrompt(draft)) return draft;
  return {
    ...draft,
    format: {
      ...draft.format,
      prompts: renumberPrompts(draft.format.prompts.filter((p) => p.id !== promptId)),
    },
  };
}

export function canAddStage(draft: FormatDraft): boolean {
  return draft.stages.length < MAX_STAGES;
}

export function addStage(draft: FormatDraft, kind: StageKind, index?: number): FormatDraft {
  if (!canAddStage(draft)) return draft;
  const stages = [...draft.stages];
  const at = index === undefined ? stages.length : Math.max(0, Math.min(index, stages.length));
  stages.splice(at, 0, newStageEntry(kind));
  return { ...draft, stages };
}

/** Whether the entry may be removed or moved: not the last collect or discuss, not the current entry. */
export function isStageLocked(
  stages: readonly StageEntry[],
  stageId: string,
  currentStageId?: string
): boolean {
  return isLockedKindEntry(stages, stageId) || stageId === currentStageId;
}

export function removeStage(draft: FormatDraft, stageId: string, currentStageId?: string): FormatDraft {
  if (isStageLocked(draft.stages, stageId, currentStageId)) return draft;
  return { ...draft, stages: draft.stages.filter((s) => s.id !== stageId) };
}

/** The order after moving `stageId` one step, or null when a lock forbids it. */
export function movedOrder(
  stages: readonly StageEntry[],
  stageId: string,
  direction: -1 | 1,
  currentStageId?: string
): string[] | null {
  const ids = stages.map((s) => s.id);
  const from = ids.indexOf(stageId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return reorderKeepsLocks(stages, next, currentStageId).ok ? next : null;
}

export function reorderStages(draft: FormatDraft, stageIds: readonly string[], currentStageId?: string): FormatDraft {
  if (!reorderKeepsLocks(draft.stages, stageIds, currentStageId).ok) return draft;
  const byId = new Map(draft.stages.map((s) => [s.id, s]));
  return { ...draft, stages: stageIds.map((id) => byId.get(id)!) };
}

export function setCardsVisible(draft: FormatDraft, stageId: string, value: Visibility): FormatDraft {
  return {
    ...draft,
    stages: draft.stages.map((s) => (s.id === stageId ? { ...s, cardsVisible: value } : s)),
  };
}
