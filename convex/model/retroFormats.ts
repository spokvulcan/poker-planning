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

export const DEFAULT_VOTE_BUDGET = 5;

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
  const kinds: StageKind[] = ["collect", "review", "group", "vote", "discuss", "close"];
  return kinds
    .filter((kind) => options.hasTeam || kind !== "review")
    .map((kind) => {
      const entry: StageEntry = {
        // An entry's identity is its own, never its kind: a kind may repeat
        // (a second vote entry is a second round of dots, ADR-0010, spec §2).
        id: newStageEntryId(),
        kind,
        cardsVisible: kind === "collect" && !format.collectVisible ? "hidden" : "visible",
        tallyVisible: kind === "vote" ? "hidden" : "visible",
      };
      if (kind === "vote") entry.voteBudget = DEFAULT_VOTE_BUDGET;
      return entry;
    });
}
