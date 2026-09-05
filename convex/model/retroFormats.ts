/**
 * The retro format library (ADR-0021, spec §6.2, §6.3): six formats as plain
 * constants, the one standard stage seed, and the eight-tint palette. Pure
 * data and pure functions — no Convex imports, no exported Convex functions —
 * so the client and a node test import it through the `@/convex` alias and
 * the model layer stamps from it.
 *
 * A format is copied whole onto the retro at creation and never referenced:
 * `stampFormat` drops the picker line, `seedStages` builds the stage list.
 * The shipped constants are never mutated.
 */

/** The eight tint tokens (`--tint-*` in globals.css); a prompt picks one. */
export const RETRO_TINTS = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export type RetroTint = (typeof RETRO_TINTS)[number];

export type StageKind = "collect" | "review" | "group" | "vote" | "discuss" | "close";
export type Visibility = "hidden" | "visible";

/** A prompt as stored on the retro: the label the board shows, the hint the write flow shows. */
export interface FormatPrompt {
  id: string;
  label: string;
  hint?: string;
  color: string;
  order: number;
}

/** What is stamped onto the retro: a name and its prompts. */
export interface StampedFormat {
  name: string;
  prompts: FormatPrompt[];
}

/** A library entry: the stamped shape plus what only the picker shows. */
export interface RetroFormat extends StampedFormat {
  /** The picker line; never copied onto a retro. */
  description: string;
  /** Seed override (Lean Coffee): `collect` opens visible. */
  collectVisible?: boolean;
}

/** One entry of the stamped stage list. */
export interface StageEntry {
  id: string;
  kind: StageKind;
  cardsVisible: Visibility;
  tallyVisible: Visibility;
  voteBudget?: number;
  maxPerTopic?: number;
  timeboxMinutes?: number;
}

/** A fresh stage entry id; per-stage state (dots, the walk) hangs off it. */
export function newStageEntryId(): string {
  return crypto.randomUUID();
}

/** Every stage kind, in the seed's order. */
export const STAGE_KINDS: readonly StageKind[] = ["collect", "review", "group", "vote", "discuss", "close"];

export const DEFAULT_VOTE_BUDGET = 5;

/** A retro carries at most ten prompts and ten stage entries (spec §2). */
export const MAX_PROMPTS = 10;
export const MAX_STAGES = 10;

/** A fresh prompt id for a prompt added after the library's; the same minting as a stage's. */
export const newPromptId = newStageEntryId;

export function isRetroTint(color: string): color is RetroTint {
  return (RETRO_TINTS as readonly string[]).includes(color);
}

/** Prompts renumbered 0..n-1 in list order. */
export function renumberPrompts(prompts: readonly FormatPrompt[]): FormatPrompt[] {
  return prompts.map((prompt, order) => ({ ...prompt, order }));
}

/** The entry the shared pointer names; the first entry if the pointer dangles. */
export function currentStageOf(retro: {
  stages: readonly StageEntry[];
  currentStageId: string;
}): StageEntry {
  return retro.stages.find((stage) => stage.id === retro.currentStageId) ?? retro.stages[0];
}

function prompts(
  entries: ReadonlyArray<readonly [id: string, label: string, hint: string, color: RetroTint]>
): FormatPrompt[] {
  return entries.map(([id, label, hint, color], order) => ({ id, label, hint, color, order }));
}

/**
 * The six formats, positive-first, every negative prompt asking for the
 * change in the same breath. This list is a familiarity choice, not an
 * evidenced one (no study compares formats); the one real constraint is
 * that no prompt opens the complaining cycle, which the node test guards.
 */
export const RETRO_FORMATS: readonly RetroFormat[] = [
  {
    name: "Went well, Do differently, Ideas",
    description: "The familiar three. A good first retro.",
    prompts: prompts([
      ["went-well", "What went well?", "Something worth keeping. Name what made it work.", "green"],
      [
        "do-differently",
        "What should we do differently?",
        "A change you would make, not a complaint. What would you try instead?",
        "amber",
      ],
      ["ideas", "Ideas", "Anything you would like the team to try, even half-formed.", "blue"],
    ]),
  },
  {
    name: "Start, Stop, Continue",
    description: "Every card asks for a change.",
    prompts: prompts([
      ["continue", "Continue", "Something that works and should stay.", "green"],
      ["start", "Start", "Something we do not do yet that would help.", "blue"],
      ["stop", "Stop", "Something we do that costs more than it gives.", "red"],
    ]),
  },
  {
    name: "Glad, Sad, Mad",
    description: "How the sprint felt, glad first.",
    prompts: prompts([
      ["glad", "Glad", "What made you glad this sprint?", "green"],
      ["sad", "Sad", "What disappointed you, and what would have helped?", "blue"],
      ["mad", "Mad", "What frustrated you? Say what you would change.", "red"],
    ]),
  },
  {
    name: "4Ls",
    description: "Liked, learned, lacked, longed for.",
    prompts: prompts([
      ["liked", "Liked", "What did you enjoy?", "green"],
      ["learned", "Learned", "Something you know now that you did not before.", "blue"],
      ["lacked", "Lacked", "What was missing, and what would it have changed?", "amber"],
      ["longed-for", "Longed for", "What do you wish we had?", "violet"],
    ]),
  },
  {
    name: "Sailboat",
    description: "The team as a boat: what pushes, what drags, what is ahead.",
    prompts: prompts([
      ["wind", "Wind", "What is pushing us forward?", "teal"],
      ["island", "Island", "Where are we trying to get to?", "green"],
      ["anchors", "Anchors", "What is holding us back, and how would we lift it?", "amber"],
      ["rocks", "Rocks", "A risk ahead we should steer around.", "red"],
    ]),
  },
  {
    name: "Lean Coffee",
    description: "No prompts, just topics. Vote, then talk.",
    collectVisible: true,
    prompts: prompts([
      [
        "topics",
        "Topics",
        "Something you want the team to talk about. One topic per card.",
        "blue",
      ],
    ]),
  },
];

export const DEFAULT_RETRO_FORMAT: RetroFormat = RETRO_FORMATS[0];

/** The library entry with this name, or undefined. */
export function findFormat(name: string): RetroFormat | undefined {
  return RETRO_FORMATS.find((format) => format.name === name);
}

/**
 * What creation copies onto the retro: the name and the prompts, and nothing
 * the picker shows. A fresh copy — the shipped constant is never shared.
 */
export function stampFormat(format: RetroFormat): StampedFormat {
  return {
    name: format.name,
    prompts: format.prompts.map((prompt) => ({ ...prompt })),
  };
}

/**
 * The standard seed (spec §6.3): collect (cards hidden) → review → group →
 * vote (tally hidden, budget 5) → discuss → close. Lean Coffee's collect is
 * visible. A teamless retro drops `review` at creation — a creation rule, not
 * a format rule, because review is a query over the Team's open actions.
 */
export function seedStages(
  format: Pick<RetroFormat, "collectVisible">,
  options: { hasTeam: boolean }
): StageEntry[] {
  return STAGE_KINDS
    .filter((kind) => options.hasTeam || kind !== "review")
    .map((kind) => newStageEntry(kind, { collectVisible: format.collectVisible }));
}

/**
 * A fresh entry of a kind with the seed's defaults: `collect` hides cards
 * unless the format says otherwise, `vote` hides the tally and carries the
 * default budget, everything else is visible with no budget.
 */
export function newStageEntry(
  kind: StageKind,
  options: { collectVisible?: boolean } = {}
): StageEntry {
  const entry: StageEntry = {
    // An entry's identity is its own, never its kind: a kind may repeat
    // (a second vote entry is a second round of dots, ADR-0010, spec §2).
    id: newStageEntryId(),
    kind,
    cardsVisible: kind === "collect" && !options.collectVisible ? "hidden" : "visible",
    tallyVisible: kind === "vote" ? "hidden" : "visible",
  };
  if (kind === "vote") entry.voteBudget = DEFAULT_VOTE_BUDGET;
  return entry;
}

/** The kinds every retro keeps at least one of (ADR-0021): the write stage and the walk. */
export const LOCKED_STAGE_KINDS: readonly StageKind[] = ["collect", "discuss"];

/**
 * Whether the entry is the last of a locked kind, so it can neither be
 * removed nor moved. A second entry of the same kind is free.
 */
export function isLockedKindEntry(stages: readonly StageEntry[], stageId: string): boolean {
  const entry = stages.find((stage) => stage.id === stageId);
  if (!entry || !LOCKED_STAGE_KINDS.includes(entry.kind)) return false;
  return stages.filter((stage) => stage.kind === entry.kind).length === 1;
}

/**
 * Whether `nextIds` is a legal reorder of `stages` (spec §6.4): a
 * permutation in which the current entry keeps its index (the ground under
 * the shared pointer never moves) and the locked kinds keep their order
 * among themselves (collect stays ahead of discuss); every other entry may
 * be placed anywhere, before or after them. The rule for the create form
 * (no current entry) and the running retro alike.
 */
export function reorderKeepsLocks(
  stages: readonly StageEntry[],
  nextIds: readonly string[],
  currentStageId?: string
): { ok: true } | { ok: false; reason: "not-a-permutation" | "locked-moved" } {
  const ids = stages.map((stage) => stage.id);
  if (nextIds.length !== ids.length || new Set(nextIds).size !== ids.length) {
    return { ok: false, reason: "not-a-permutation" };
  }
  if (!ids.every((id) => nextIds.includes(id))) {
    return { ok: false, reason: "not-a-permutation" };
  }
  if (currentStageId !== undefined && ids.indexOf(currentStageId) !== nextIds.indexOf(currentStageId)) {
    return { ok: false, reason: "locked-moved" };
  }
  const lockedBefore = ids.filter((id) => isLockedKindEntry(stages, id));
  const lockedAfter = nextIds.filter((id) => isLockedKindEntry(stages, id));
  const held = lockedBefore.every((id, i) => lockedAfter[i] === id);
  return held ? { ok: true } : { ok: false, reason: "locked-moved" };
}

/** The list with `entry` inserted at `index` (clamped), or at the end. */
export function insertStage(
  stages: readonly StageEntry[],
  entry: StageEntry,
  index?: number
): StageEntry[] {
  const next = [...stages];
  const at = index === undefined ? next.length : Math.max(0, Math.min(index, next.length));
  next.splice(at, 0, entry);
  return next;
}

/** The same entries re-listed in the order of `ids`; the caller has checked `ids` is a permutation. */
export function orderStagesBy(stages: readonly StageEntry[], ids: readonly string[]): StageEntry[] {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  return ids.map((id) => byId.get(id)!);
}
