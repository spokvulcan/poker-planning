/**
 * The retro's UI copy register (spec §19), in one plain module the model
 * layer throws from and the client renders from, so a wording is a constant
 * rather than a repetition. Importable from src/ like teamCopy.ts: no server
 * imports here. Later retro tickets extend it; #300 tests the register
 * against it.
 */
import type { JoinPolicy } from "./permissions";

/** The last-admin rule (spec §19), owned by the Team's copy module and read from here too. */
export { LAST_ADMIN_MESSAGE } from "./teamCopy";

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

/** The stages whose empty state is about cards; `review` and `close` speak through their panels (spec §13). */
export type CardStageKind = "collect" | "group" | "vote" | "discuss";
/**
 * Each card stage's empty state (ADR-0010): entering a stage with nothing
 * in it renders an explanation, never a lock. The review's and the close's
 * lines are `REVIEW_EMPTY` and `ACTIONS_EMPTY`.
 */
export const STAGE_EMPTY: Record<CardStageKind, string> = {
  collect: "No cards yet. Every prompt has a zone; write into any of them.",
  group: "Nothing to group yet. Cards written in Collect show up here.",
  vote: "Nothing to vote on yet. Cards and groups show up here once written.",
  discuss: "Nothing to discuss yet. Topics show up here once cards are written.",
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

// --- Nudges and email (spec §16, §19, ADR-0020) ---

/** `nudge` on a teamless retro: no Team, no addressable audience. */
export const NUDGE_NEEDS_TEAM = "Only a retro kept by a team can email its members";
/** `nudge` while the shared pointer is outside `collect`. */
export const NUDGE_ONLY_IN_COLLECT = "Cards can be asked for only while the retro is collecting";
/** `nudge` inside 24 hours of the last one (the "it's open" email counts). */
export const NUDGE_TOO_SOON = "The team was emailed less than a day ago";

/** The nudge button, named retro: the team members with no card. */
export const nudgeNonWriters = (n: number) =>
  n === 1 ? "Email 1 person who hasn't written" : `Email ${n} people who haven't written`;
/** The nudge button, anonymous retro: every team member but the sender. */
export const nudgeTeamMembers = (n: number) =>
  n === 1 ? "Email 1 team member" : `Email ${n} team members`;
/** The nudge button after a send, until the day passes. */
export const nudgeSent = (ago: string, name: string) => `Sent ${ago} by ${name}`;

/** The create form's checkbox (team retros only, on by default). */
export const EMAIL_TEAM_OPEN_LABEL = "Email the team that it's open";
/** The Settings toggle (Account tab). */
export const EMAIL_OPT_IN_LABEL = "Email me about retros and action items";
export const EMAIL_SECTION_TITLE = "Email";
export const EMAIL_OPT_IN_DESCRIPTION = "One switch for every retro and action email. Sign-in emails are never affected.";
export const EMAIL_OPT_IN_FAILED = "That did not save. Try again.";
export const ACCOUNT_TAB_LABEL = "Account";
export const SETTINGS_PAGE_DESCRIPTION = "Manage your account, emails and integrations.";
/** The `/unsubscribe` page, whatever the token did. The word "Settings" is the link. */
export const UNSUBSCRIBED_TITLE = "Unsubscribed";
export const UNSUBSCRIBED = "You won't get retro or action emails. Turn them back on in Settings.";
/** The `/unsubscribe` page when the request itself failed (never for a stale token). */
export const UNSUBSCRIBE_FAILED = "That link did not go through. You can turn these emails off in Settings.";
/** The listing's per-viewer hint in a named retro (spec §16.5). */
export const COLLECT_HINT_NO_CARD = "You haven't added a card yet";

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
export const JOIN_POLICY_OPTIONS: { value: JoinPolicy; label: string }[] = [
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
export const NAME_INVALID = "That name will not do";
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

/** `claim` denied with `owner-present` (spec §4.3, §19); `permissions.denialMessage` reads it from here. */
export const CLAIM_DENIED = "The owner is still here — ask them to transfer ownership.";
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

/** Delete team confirm (spec §19): the title names the Team, the body its retro count. */
export const deleteTeamTitle = (team: string) => `Delete ${team}?`;
export const deleteTeamConfirm = (n: number) =>
  `Its ${n} ${n === 1 ? "retro" : "retros"} and their action items are removed permanently. This cannot be undone.`;

// --- The ratchet (spec §4.3, §19; ADR-0012) ---

export const RATCHET_MENU_ITEM = "Make anonymous…";
export const RATCHET_TITLE = "Make this retro anonymous?";
export const RATCHET_DESCRIPTION =
  "Every author is removed permanently and this cannot be undone.";
export const RATCHET_BUTTON = "Make anonymous";
export const RATCHETING_BUTTON = "Removing authors…";
export const RATCHET_FAILED = "Failed to make this retro anonymous";
export const RETRO_ANONYMOUS = "This retro is now anonymous";


// --- Cards (spec §8.1, §19; ADR-0012, ADR-0015, ADR-0022) ---

/** A card act naming a `clientId` the room does not carry. */
export const CARD_NOT_FOUND = "That card is no longer on the board";
export const CARD_TEXT_REQUIRED = "A card needs some text";
export const CARD_TEXT_TOO_LONG = "A card holds at most 2000 characters";
/** Composer, named (ADR-0012). */
export const postedAs = (name: string) => `Posted as ${name}. Your name stays with this card.`;
/** Composer, anonymous (ADR-0012): the claim the storage supports, no more. */
export const COMPOSER_ANONYMOUS =
  "Anonymous. Your name is not saved with this card, not even for the facilitator. Edit or delete it from this device.";
/** Composer, hidden, named (ADR-0015); stacks under the attribution line. */
export const COMPOSER_HIDDEN_NAMED =
  "Only you can read this for now. Others can see you've added a card, not what it says. Everyone reads it once cards are revealed.";
/** Composer, hidden, anonymous (ADR-0015). */
export const COMPOSER_HIDDEN_ANONYMOUS =
  "Only you can read this for now. Everyone reads it once cards are revealed.";
/** Composer, visible, either attribution. */
export const COMPOSER_VISIBLE = "Everyone in the retro can read this now.";

export const ADD_CARD = "Add card";
export const COMPOSER_TITLE = "Write a card";
export const COMPOSER_PROMPT_LABEL = "Prompt";
export const COMPOSER_TEXT_LABEL = "Your card";
export const COMPOSER_TEXT_PLACEHOLDER = "One thought per card";
export const COMPOSER_SUBMIT = "Post card";
export const CARD_TEXT_FIELD = "Card text";
export const DELETE_CARD = "Delete card";
export const UNSAVED_CHIP = "Unsaved";
export const EDITING_CHIP = "Editing";
export const HIDDEN_CARD_LABEL = "Hidden card";
export const HAS_WRITTEN = "Has written";
export const cardsCount = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;
/** Missing user (spec §19). */
export const FORMER_MEMBER = "Former member";
export const CARD_ACT_FAILED = "That did not go through. Try again.";

// --- Clusters (spec §10.3, §19; ADR-0011, ADR-0016) ---

/** The default cluster name at formation. */
export const groupName = (n: number) => `Group ${n}`;
/**
 * The next default name: one past the highest "Group {n}" the room carries
 * and past the row count, so a number freed by a merge or dissolve is never
 * handed out twice while its neighbours stand. Here rather than in the
 * model because the optimistic form names its placeholder by the same rule.
 */
export function nextGroupName(clusters: readonly { name: string }[]): string {
  let highest = 0;
  for (const cluster of clusters) {
    const match = /^Group (\d+)$/.exec(cluster.name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return groupName(Math.max(highest, clusters.length) + 1);
}
/** A cluster act naming a row the room does not carry. */
export const CLUSTER_NOT_FOUND = "That group is no longer on the board";
export const CLUSTER_SELECTION_REQUIRED = "Select at least one card to group";
export const CLUSTER_NAME_REQUIRED = "A group needs a name";
export const CLUSTER_NAME_TOO_LONG = "A group name holds at most 80 characters";
export const MERGE_INTO_SELF = "Pick a different group to merge into";
/** Dissolve confirmation, only when the cluster has dots (spec §19; #294). */
export const dissolveClusterConfirm = (votes: number) =>
  `Dissolve this group? Its ${votes} ${votes === 1 ? "vote is" : "votes are"} removed.`;
export const groupCards = (n: number) => `Group ${n} ${n === 1 ? "card" : "cards"}`;
export const ADD_TO_GROUP = "Add to group";
export const REMOVE_FROM_GROUP = "Remove from group";
export const CLEAR_SELECTION = "Clear selection";
export const selectedCards = (n: number) => `${n} selected`;
export const RENAME_GROUP = "Rename group";
export const GROUP_NAME_LABEL = "Group name";
export const RENAME_GROUP_SAVE = "Save";
export const MERGE_GROUP = "Merge into…";
export const MERGE_GROUP_TITLE = "Merge group";
export const MERGE_GROUP_INTO_LABEL = "Into";
export const MERGE_GROUP_BUTTON = "Merge";
export const TIDY_GROUP = "Tidy";
export const DISSOLVE_GROUP = "Dissolve group";
export const GROUP_MENU = "Group actions";
export const CLUSTER_ACT_FAILED = "That did not go through. Try again.";

// --- Mobile chrome (spec §10.4) ---

export const BOARD_MENU = "Board menu";

// Dots (spec §11, §19).
/** Refusal `stage`: the current entry carries no budget. */
export const NO_VOTE_BUDGET = "This stage takes no votes";
/** Refusal `budget`: the voter's rows for the entry equal the budget. */
export const VOTE_BUDGET_SPENT = "All your votes are placed";
/** Refusal `budget`: the voter's dots on the topic equal `maxPerTopic`. */
export const TOPIC_VOTES_CAPPED = "No more votes on this topic";
/** Refusal `missing`: no own dot to take off the topic. */
export const DOT_NOT_FOUND = "You have no vote here";
/** The vote UI's line in an anonymous retro (spec §19). */
export const VOTE_ANONYMOUS_NOTE = "Nobody is shown how you voted.";
export const votesLeft = (left: number, budget: number) => `${left} of ${budget} ${budget === 1 ? "vote" : "votes"} left`;
export const votesCount = (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`;
export const ADD_DOT = "Vote";
export const REMOVE_DOT = "Remove vote";
export const DISSOLVE_WITH_VOTES_TITLE = "Dissolve group";
export const DISSOLVE_CONFIRM_BUTTON = "Dissolve";
export const CANCEL_BUTTON = "Cancel";
export const DOT_ACT_FAILED = "That vote did not go through. Try again.";

// --- The discussion walk (spec §12, §19; ADR-0023) ---

/** Refusal `stage`: the shared pointer is not a `discuss` entry with a walk. */
export const NO_WALK = "The walk opens in Discuss";
/** Refusal `missing`: a cursor index outside the order, or a tick on a topic it does not hold. */
export const WALK_TOPIC_NOT_FOUND = "That topic is not in the walk";
export const WALK_TITLE = "Discussion";
/**
 * The coverage facts (spec §17): what the stored walk alone says. The
 * history row prints this; the board's readout adds the late count, which
 * needs the cards.
 */
export const coverageFacts = (covered: number, total: number) => `${covered} of ${total} covered`;
/** The coverage readout (spec §19). */
export const coverageReadout = (covered: number, total: number, late: number) =>
  `${coverageFacts(covered, total)} · ${late} new`;
export const writtenSince = (n: number) => `${n} written since the order was set`;
export const topicsWithoutVotes = (n: number) => `${n} ${n === 1 ? "topic" : "topics"} without votes`;
export const WALK_EMPTY = "Nothing to walk yet";
export const GO_TO_TOPIC = "Go";
export const RAISE_TOPIC = "Raise";
export const COVERED_LABEL = "Covered";
export const CURRENT_TOPIC = "Now";
/** The late marker on a card (spec §12.3), at every zoom level. */
export const LATE_CARD_MARKER = "New";
export const WALK_ACT_FAILED = "That did not go through. Try again.";

// --- Action items (spec §13, §19; ADR-0017) ---

export const ACTIONS_TITLE = "Action items";
export const ADD_ACTION = "Add action";
export const ACTION_TEXT_LABEL = "Action";
export const ACTION_TEXT_PLACEHOLDER = "What will be done";
export const ACTION_OWNER_LABEL = "Owner";
export const ACTION_DUE_LABEL = "Due";
export const ACTION_NOTE_LABEL = "Note";
export const ACTION_NOTE_PLACEHOLDER = "Why, in a sentence (optional)";
export const ACTION_SUBMIT = "Add";
export const ACTION_SAVE = "Save";
export const ACTION_EDIT = "Edit";
export const ACTION_DONE = "Done";
export const ACTION_DROP = "Drop";
export const ACTION_REOPEN = "Reopen";
export const ACTION_DELETE = "Delete action";
export const ACTION_DELETE_TITLE = "Delete this action item?";
export const ACTION_DELETE_CONFIRM = "Delete";
/** The composer's source line: drop the topic, keep the text. */
export const CLEAR_SOURCE = "Clear source";
/** Unowned action (spec §19): the rendered state, and the owner picker's empty choice. */
export const UNOWNED_ACTION = "Nobody owns this yet";
/** Overdue: `dueAt` past and still `open` — a rendering state, not a status. */
export const OVERDUE = "Overdue";
export const ACTION_STATUS_LABELS: Record<"open" | "done" | "dropped", string> = {
  open: "Open",
  done: "Done",
  dropped: "Dropped",
};
/** Close panel facts (spec §19): never a judgement about the count. */
export const closeFacts = (n: number, unowned: number) =>
  `${n} ${n === 1 ? "action" : "actions"}, ${unowned} unowned`;
/** Review empty state (spec §19). */
export const REVIEW_EMPTY = "No open actions from earlier retros";
export const ACTIONS_EMPTY = "No action items yet.";
export const ownedBy = (name: string) => `Owner: ${name}`;
export const dueOn = (date: string) => `Due ${date}`;
export const fromRetro = (name: string) => `From ${name}`;
export const ACTION_SOURCE_LABEL = "About";
export const OPEN_ACTIONS_TITLE = "Open action items";
export const OPEN_ACTIONS_EMPTY = "No open action items across this team's retros.";
/** A team member who never attended the item's retro reads it and cannot act (ADR-0008). */
export const NOT_ATTENDING = "Join that retro to act on its action items";

/** Refusal `missing`: an action act naming a row the room does not carry. */
export const ACTION_NOT_FOUND = "That action item is no longer here";
export const ACTION_TEXT_REQUIRED = "An action item needs some text";
export const ACTION_TEXT_TOO_LONG = "An action item holds at most 500 characters";
export const ACTION_NOTE_TOO_LONG = "A note holds at most 500 characters";
/** Refusal `forbidden`: an owner who is not a member of the retro. */
export const OWNER_NOT_MEMBER = "Only someone in this retro can own an action item";
/** Refusal `forbidden`: a note on a change that does not leave `open`. */
export const NOTE_ONLY_ON_LEAVING_OPEN = "A note goes with marking an action done or dropped";
export const ACTION_ACT_FAILED = "That did not go through. Try again.";

// --- Retro facts (spec §17, §19; ADR-0024) ---

/** History row counts (spec §19): this retro's action items by status, as facts with a unit. */
export const historyRowCounts = (open: number, done: number, dropped: number) =>
  `${open} open · ${done} done · ${dropped} dropped`;
/** Team count line (spec §19): the sum over the Team's action index and a count of its rooms. */
export const teamCountLine = (open: number, done: number, dropped: number, retros: number) =>
  `${historyRowCounts(open, done, dropped)} across ${retros} ${retros === 1 ? "retro" : "retros"}`;
/** The attribution as the history row names it (ADR-0012). */
export const ATTRIBUTION_LABELS: Record<"named" | "anonymous", string> = {
  named: "Named",
  anonymous: "Anonymous",
};
export const createdOn = (date: string) => `Created ${date}`;

// --- Account deletion (spec §15.2, §19; ADR-0019) ---

export const DELETE_ACCOUNT_SECTION_TITLE = "Delete account";
export const DELETE_ACCOUNT_SECTION_DESCRIPTION =
  "Removes your account from AgileKit. Your sign-in provider keeps its own record.";
export const DELETE_ACCOUNT_BUTTON = "Delete account";
export const DELETE_ACCOUNT_TITLE = "Delete your account?";
/** Delete account (spec §19): what goes and what stays, before and after the act. */
export const ACCOUNT_DELETED =
  "Your account is removed. Cards and action items you wrote in team retros stay with those teams, without your name.";
export const DELETING_ACCOUNT_BUTTON = "Deleting…";
export const DELETE_ACCOUNT_FAILED = "Failed to delete your account";
