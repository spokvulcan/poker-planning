/**
 * The retro's vocabulary, shared by the Convex model and the browser: the
 * steps a retro moves through, the sticky colours, the column templates a
 * retro starts from, and the caps on what a participant can write. Pure: no
 * IO, no Convex runtime.
 */

/**
 * Where the retro is. `write` keeps other people's stickies face-down;
 * `vote` reveals them and hands out votes; `discuss` shows the totals and
 * walks the most-voted topics; `done` is the wrap-up. Nothing is ever locked:
 * the board stays a whiteboard in every step.
 */
export type RetroStep = "write" | "vote" | "discuss" | "done";

export const RETRO_STEPS: readonly RetroStep[] = ["write", "vote", "discuss", "done"];

/** The sticky colours a column can take. */
export type StickyColor = "yellow" | "green" | "pink" | "blue" | "purple" | "orange";

export const STICKY_COLORS: readonly StickyColor[] = [
  "yellow",
  "green",
  "pink",
  "blue",
  "purple",
  "orange",
];

/** One column of the board: a sticky pad with a prompt, an emoji and a colour. */
export interface RetroColumn {
  id: string;
  title: string;
  emoji: string;
  color: StickyColor;
}

export interface RetroTemplate {
  id: string;
  name: string;
  /** One line for the picker. */
  description: string;
  columns: Omit<RetroColumn, "id">[];
}

export const RETRO_TEMPLATES: readonly RetroTemplate[] = [
  {
    id: "classic",
    name: "Went well, To improve, Ideas",
    description: "The everyday retro. Works for any sprint.",
    columns: [
      { title: "Went well", emoji: "😊", color: "green" },
      { title: "To improve", emoji: "🤔", color: "pink" },
      { title: "Ideas", emoji: "💡", color: "yellow" },
    ],
  },
  {
    id: "start-stop-continue",
    name: "Start, Stop, Continue",
    description: "Straight to what the team should change.",
    columns: [
      { title: "Start", emoji: "🚀", color: "green" },
      { title: "Stop", emoji: "🛑", color: "pink" },
      { title: "Continue", emoji: "🔁", color: "blue" },
    ],
  },
  {
    id: "mad-sad-glad",
    name: "Mad, Sad, Glad",
    description: "How the sprint felt, not only what happened.",
    columns: [
      { title: "Glad", emoji: "😄", color: "green" },
      { title: "Sad", emoji: "😢", color: "blue" },
      { title: "Mad", emoji: "😤", color: "pink" },
    ],
  },
  {
    id: "4ls",
    name: "Liked, Learned, Lacked, Longed for",
    description: "The 4Ls. Good after a long or unusual sprint.",
    columns: [
      { title: "Liked", emoji: "👍", color: "green" },
      { title: "Learned", emoji: "📚", color: "blue" },
      { title: "Lacked", emoji: "🧩", color: "pink" },
      { title: "Longed for", emoji: "✨", color: "purple" },
    ],
  },
  {
    id: "sailboat",
    name: "Sailboat",
    description: "What pushed us, what held us back, what lies ahead.",
    columns: [
      { title: "Wind", emoji: "💨", color: "green" },
      { title: "Anchors", emoji: "⚓", color: "pink" },
      { title: "Rocks ahead", emoji: "🪨", color: "orange" },
      { title: "Island", emoji: "🏝️", color: "blue" },
    ],
  },
];

export const DEFAULT_TEMPLATE_ID = "classic";

/** Looks a template up by id, falling back to the default. */
export function templateById(id: string | undefined): RetroTemplate {
  return RETRO_TEMPLATES.find((t) => t.id === id) ?? RETRO_TEMPLATES[0];
}

/** The columns a new retro starts with: the template's, with stable ids. */
export function columnsFromTemplate(templateId: string | undefined): RetroColumn[] {
  return templateById(templateId).columns.map((column, index) => ({
    ...column,
    id: `c${index + 1}`,
  }));
}

/** A fresh id for a column added later, unique among `columns`. */
export function nextColumnId(columns: readonly Pick<RetroColumn, "id">[]): string {
  const taken = new Set(columns.map((c) => c.id));
  let n = columns.length + 1;
  while (taken.has(`c${n}`)) n++;
  return `c${n}`;
}

// --- Caps -------------------------------------------------------------------

export const DEFAULT_VOTES_PER_PERSON = 3;
export const MIN_VOTES_PER_PERSON = 1;
export const MAX_VOTES_PER_PERSON = 10;

export const MAX_STICKY_TEXT_LENGTH = 500;
export const MAX_STICKIES_PER_ROOM = 400;
export const MAX_COLUMNS = 6;
export const MAX_COLUMN_TITLE_LENGTH = 40;
export const MAX_ACTION_TEXT_LENGTH = 300;
export const MAX_ACTIONS_PER_ROOM = 100;
