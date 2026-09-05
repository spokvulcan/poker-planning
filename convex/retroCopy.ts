/**
 * The retro's UI copy register (spec §19), in one plain module the model
 * layer throws from and the client renders from, so a wording is a constant
 * rather than a repetition. Importable from src/ like teamCopy.ts: no server
 * imports here. Later retro tickets extend it; #300 tests the register
 * against it.
 */

// --- Board header disclosures (ADR-0008, ADR-0019) ---

/** Board header and create form, teamless retro. */
export const TEAMLESS_DISCLOSURE =
  "Not kept by a team. This retro disappears after 5 quiet days.";

/** Board header and create form, team retro. Doubles as the team-page link. */
export const keptByTeam = (teamName: string) =>
  `Kept by ${teamName}. Its members can read this later, until the retro or the team is deleted.`;

/** A Team member reading a retro they never joined (ADR-0009). */
export const readingAsTeamMember = (teamName: string) =>
  `You're reading this as a member of ${teamName}. Join to take part.`;

// --- Listings (spec §16.5, §18.1) ---

export const NO_TEAM_GROUP = "No team";
export const TEAM_RETROS_TITLE = "Retros";
export const TEAM_RETROS_EMPTY = "No retros yet. Start one and this team keeps it.";
export const MY_RETROS_TITLE = "Your retros";
export const MY_RETROS_EMPTY = "Retros you take part in show up here.";

// --- Join (spec §4.4) ---

/** `evaluateJoin` denied with `permanent-account-required`. */
export const JOIN_DENIED_PERMANENT = "This retro is for signed-in accounts. Sign in to join.";

/** `evaluateJoin` denied with `team-members-only`. */
export const joinDeniedTeam = (teamName: string) =>
  `This retro is for members of ${teamName}. Ask an admin for the invite link.`;

export const JOIN_RETRO_TITLE = "Join retro";
export const JOIN_RETRO_BUTTON = "Join retro";
export const JOIN_NAME_LABEL = "Your name";
export const JOIN_NAME_PLACEHOLDER = "Enter your name";
export const JOIN_FAILED = "Failed to join retro";

// --- Creation (spec §6.1) ---

export const NEW_RETRO_TITLE = "New retro";
export const NEW_RETRO_DESCRIPTION = "Name it, pick a format, and open the board.";
export const RETRO_NAME_LABEL = "Retro name";
export const RETRO_NAME_PLACEHOLDER = "e.g., Sprint 42 retro";
export const RETRO_NAME_DESCRIPTION = "Leave empty for a dated name";
export const FORMAT_LABEL = "Format";
export const FORMAT_CHANGE = "Change";
export const FORMAT_COLLAPSE = "Done";
export const COLLECT_UNTIL_LABEL = "Cards due";
export const COLLECT_UNTIL_DESCRIPTION =
  "Optional. Shown on the board as a reminder; it closes nothing by itself.";
export const CREATE_RETRO_BUTTON = "Start retro";
export const CREATING_RETRO_BUTTON = "Starting...";
export const CREATE_RETRO_FAILED = "Failed to create retro. Please try again.";

/** The default retro name when the field is left blank. */
export const defaultRetroName = (date: Date) => `Retro ${date.toLocaleDateString()}`;

/** `retro.create` given a format name the library does not carry. */
export const UNKNOWN_FORMAT = "Unknown retro format";

/** `retro.board` on a room that has no retros row. */
export const NOT_A_RETRO = "This room is not a retro";

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
export const LOADING_TITLE = "Loading...";
export const CHECKING_SESSION = "Checking session";
export const LOADING_BOARD = "Opening the board...";

// --- Team (spec §5) ---

export const TEAM_LABEL = "Team";
export const NO_TEAM_OPTION = NO_TEAM_GROUP;
export const NEW_TEAM_OPTION = "New team…";
export const TEAM_DESCRIPTION = "A team keeps the retro and decides who can read it later.";

/** `adoptIntoTeam` by an attendee who does not own the room. */
export const ONLY_OWNER_CAN_ADOPT = "Only the room owner can give this retro to a team.";

/** `adoptIntoTeam` on a room whose `teamId` is already set (set once, ADR-0008). */
export const ALREADY_KEPT_BY_TEAM = "This retro already belongs to a team.";

export const ADOPT_MENU_ITEM = "Keep with a team…";
export const ADOPT_TITLE = "Keep this retro with a team";
export const ADOPT_DESCRIPTION =
  "The team's members can read it later, and it no longer disappears after 5 quiet days. This cannot be undone.";
export const ADOPT_BUTTON = "Keep with team";
export const ADOPT_CHOOSE_TEAM = "Choose a team";
export const ADOPT_FAILED = "Failed to give this retro to the team";

// --- Claim, delete (spec §4.3, §15.2) ---

export const CLAIM_MENU_ITEM = "Claim ownership";
export const CLAIM_FAILED = "Failed to claim this retro";
export const CLAIMED = "You now own this retro";

export const DELETE_MENU_ITEM = "Delete retro";
export const DELETE_TITLE = "Delete this retro?";
export const deleteRetroConfirm = (cards: number, openActions: number) =>
  `${cards} ${cards === 1 ? "card" : "cards"}, ${openActions} open ${
    openActions === 1 ? "action item" : "action items"
  } and its history are removed permanently. This cannot be undone.`;
export const DELETE_COUNTING = "Counting…";
export const DELETE_BUTTON = "Delete retro";
export const DELETING_BUTTON = "Deleting…";
export const DELETE_FAILED = "Failed to delete this retro";
export const RETRO_DELETED = "Retro deleted";

