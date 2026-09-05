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
/** The picker line under a Team's own edited format (ADR-0021). */
export const LAST_USED_DESCRIPTION = "What this team used last.";
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

/** A retro mutation whose room row is gone. */
export const ROOM_NOT_FOUND = "Room not found";

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

/**
 * Each kind's empty state (ADR-0010): entering a stage with nothing in it
 * renders an explanation, never a lock.
 */
export const STAGE_EMPTY: Record<
  "collect" | "review" | "group" | "vote" | "discuss" | "close",
  string
> = {
  collect: "No cards yet. Every prompt has a zone; write into any of them.",
  review: "No open actions from earlier retros",
  group: "Nothing to group yet. Cards written in Collect show up here.",
  vote: "Nothing to vote on yet. Cards and groups show up here once written.",
  discuss: "Nothing to discuss yet. Topics show up here once cards are written.",
  close: "No action items yet.",
};
export const TIMEBOX_OVER = "Timebox over";

// --- Stage navigation (spec §7) ---

export const BACK_TO_TEAM = "Back to the team";
export const NEXT_STAGE = "Next stage";
export const PREVIOUS_STAGE = "Previous stage";
export const BRING_EVERYONE_HERE = "Bring everyone here";
export const SHOW_CARDS = "Show cards";
export const HIDE_CARDS = "Hide cards";
export const TIMEBOX_LABEL = "Timebox (minutes)";
export const STAGES_NAV_LABEL = "Stages";
export const STAGE_ACT_FAILED = "That did not go through. Try again.";

// --- Roster and readiness (spec §7) ---

export const ROSTER_TITLE = "People";
export const READY_LABEL = "Ready";
export const READY_TOGGLE_LABEL = "I'm ready";

/** An in-the-moment act (`setCardsVisible`, the timebox) naming an entry that is not the shared pointer's. */
export const NOT_CURRENT_STAGE = "Only the current stage can be changed here";

/** `setTimebox` with anything but a positive whole number of minutes. */
export const TIMEBOX_INVALID = "Timebox must be a whole number of minutes";

/** A stage act naming an entry the list does not carry. */
export const STAGE_ENTRY_NOT_FOUND = "That stage is no longer in this retro";

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

// --- Retro settings (spec §6.4) ---

export const SETTINGS_MENU_ITEM = "Retro settings…";
export const SETTINGS_TITLE = "Retro settings";
export const SETTINGS_DESCRIPTION =
  "Prompts and stages can change at any stage. Collect, Discuss and the current stage keep their place.";
export const JOIN_POLICY_LABEL = "Who can join";
export const JOIN_POLICY_OPTIONS: { value: "anyone" | "permanentAccounts" | "teamMembers"; label: string }[] = [
  { value: "anyone", label: "Anyone with the link" },
  { value: "permanentAccounts", label: "Signed-in accounts" },
  { value: "teamMembers", label: "Team members" },
];
export const SETTINGS_FAILED = "That change did not go through. Try again.";

// --- The format editor (spec §6.1, §6.4) ---

export const FORMAT_NAME_LABEL = "Format name";
export const PROMPTS_TITLE = "Prompts";
export const PROMPT_LABEL_FIELD = "Prompt label";
export const PROMPT_HINT_FIELD = "Hint";
export const PROMPT_HINT_PLACEHOLDER = "Shown while writing, never on the board";
export const TINT_FIELD = "Tint";
export const ADD_PROMPT = "Add prompt";
export const NEW_PROMPT_LABEL = "New prompt";
export const removePromptLabel = (label: string) => `Remove ${label}`;
export const STAGES_TITLE = "Stages";
export const ADD_STAGE = "Add stage";
export const removeStageLabel = (label: string) => `Remove ${label}`;
export const moveStageUpLabel = (label: string) => `Move ${label} up`;
export const moveStageDownLabel = (label: string) => `Move ${label} down`;
export const cardsHiddenIn = (label: string) => `Cards hidden in ${label}`;
export const cardsVisibleIn = (label: string) => `Cards visible in ${label}`;
export const CURRENT_STAGE_TAG = "current";

// --- Prompt and stage-list edits (spec §6.4) ---

export const PROMPT_LABEL_REQUIRED = "A prompt needs a label";
export const TINT_OUTSIDE_PALETTE = "Pick a tint from the palette";
export const PROMPT_NOT_FOUND = "That prompt is no longer in this retro";
export const TOO_MANY_PROMPTS = "A retro has at most 10 prompts";
export const LAST_PROMPT = "A retro needs at least one prompt";
/** `removePrompt` while a card answers it: a `forbidden` refusal, not `stage`. */
export const CARDS_STILL_ANSWER = "Cards still answer this prompt";

export const TOO_MANY_STAGES = "A retro has at most 10 stages";
export const FORMAT_NAME_REQUIRED = "A format needs a name";
export const PROMPT_IDS_UNIQUE = "Every prompt needs its own id";
export const STAGE_IDS_UNIQUE = "Every stage needs its own id";
export const VOTE_BUDGET_INVALID = "Vote budget must be a whole number of dots";
export const STAGE_KIND_LOCKED = "Collect and Discuss stay in every retro";
export const STAGE_CURRENT_LOCKED = "The current stage keeps its place";
export const STAGE_ORDER_LOCKED = "Collect, Discuss and the current stage keep their place";
export const STAGE_ORDER_INVALID = "The new order must list every stage once";

/** `setJoinPolicy` to `teamMembers` on a retro no Team keeps. */
export const TEAM_MEMBERS_NEEDS_TEAM = "Only a team retro can be limited to team members";

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

