/**
 * The Team's refusal copy (spec §19, ADR-0008), in one pure module so the
 * model layer that throws it and the client that recognises it share a
 * constant rather than a wording. Importable from src/ like permissions.ts
 * and scales.ts: no server imports here.
 */

/** The last-admin rule: a Team can never be left without an admin. */
export const LAST_ADMIN_MESSAGE =
  "Make someone else an admin first, or delete the team.";

/** Creating a Team needs a permanent account. */
export const SIGN_IN_TO_CREATE = "Sign in to create a team";

/** `requireTeamRole`: no membership row for this Team. */
export const NOT_A_TEAM_MEMBER = "You are not a member of this team";

/** `requireTeamRole`: the Team row is gone. */
export const TEAM_NOT_FOUND = "Team not found";

/** `requireTeamRole`: an admin-only action by a member. */
export const TEAM_ADMIN_ONLY = "Only a team admin can do that";

/** A role or removal action aimed at someone without a membership row. */
export const TARGET_NOT_A_TEAM_MEMBER = "Not a member of this team";

/** `removeMember` aimed at oneself; `leave` is the route. */
export const LEAVE_INSTEAD = "Leave the team instead";

/** The invite route: no live token matches. */
export const INVITE_LINK_INVALID = "This invite link is no longer valid";

/** The invite route (spec §19): joining needs a permanent account. */
export const signInToJoin = (teamName: string) => `Sign in to join ${teamName}`;

export const MAX_TEAM_NAME_LENGTH = 100;
export const TEAM_NAME_EMPTY = "Team name cannot be empty";
export const TEAM_NAME_TOO_LONG = `Team name cannot exceed ${MAX_TEAM_NAME_LENGTH} characters`;
