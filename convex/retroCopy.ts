/**
 * The retro's UI copy register (spec §19), in one plain module the model
 * layer throws from and the client renders from, so a wording is a constant
 * rather than a repetition. Importable from src/ like teamCopy.ts: no server
 * imports here. Later retro tickets extend it; #300 tests the register
 * against it.
 */

// --- Board header disclosures (ADR-0008, ADR-0019) ---

/** Board header, teamless retro. */
export const TEAMLESS_DISCLOSURE =
  "Not kept by a team. This retro disappears after 5 quiet days.";

/** Board header, team retro. */
export const teamDisclosure = (teamName: string) =>
  `Kept by ${teamName}. Its members can read this later, until the retro or the team is deleted.`;

// --- Join (spec §4.4) ---

/** `evaluateJoin` denied with `permanent-account-required`. */
export const JOIN_DENIED_PERMANENT = "This retro is for signed-in accounts. Sign in to join.";

/** `evaluateJoin` denied with `team-members-only`. */
export const joinDeniedTeam = (teamName: string) =>
  `This retro is for members of ${teamName}. Ask an admin for the invite link.`;

export const JOIN_RETRO_TITLE = "Join retro";
export const JOIN_RETRO_BUTTON = "Join retro";

// --- Creation (spec §6.1) ---

export const NEW_RETRO_TITLE = "New retro";
export const NEW_RETRO_DESCRIPTION = "Name it, pick a format, and open the board.";
export const RETRO_NAME_LABEL = "Retro name";
export const RETRO_NAME_PLACEHOLDER = "e.g., Sprint 42 retro";
export const FORMAT_LABEL = "Format";
export const FORMAT_CHANGE = "Change";
export const FORMAT_COLLAPSE = "Done";
export const COLLECT_UNTIL_LABEL = "Cards due";
export const COLLECT_UNTIL_DESCRIPTION =
  "Optional. Shown on the board as a reminder; it closes nothing by itself.";
export const CREATE_RETRO_BUTTON = "Start retro";
export const CREATING_RETRO_BUTTON = "Starting...";

/** The default retro name when the field is left blank. */
export const defaultRetroName = (date: Date) => `Retro ${date.toLocaleDateString()}`;

/** `retro.create` given a format name the library does not carry. */
export const UNKNOWN_FORMAT = "Unknown retro format";

// --- Stages (spec §7) ---

/** The stage pill's label per kind. */
export const STAGE_LABELS: Record<
  "collect" | "review" | "group" | "vote" | "discuss" | "close",
  string
> = {
  collect: "Collect",
  review: "Review",
  group: "Group",
  vote: "Vote",
  discuss: "Discuss",
  close: "Close",
};

export const STAGE_PILL_LABEL = "Stage";

// --- Board (spec §16.5, §19) ---

export const collectUntilLine = (date: string) => `Cards due ${date}`;
export const LOADING_BOARD = "Opening the board...";
export const RETRO_NOT_FOUND_TITLE = "Retro not found";
export const RETRO_NOT_FOUND_BODY = "This retro doesn't exist or has been deleted.";
