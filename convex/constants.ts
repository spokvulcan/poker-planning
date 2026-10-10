/**
 * Shared constants used across both frontend and backend
 */

import { fieldRule } from "./fieldRule";

/**
 * Duration for auto-reveal countdown in milliseconds
 */
export const COUNTDOWN_DURATION_MS = 3000; // 3 seconds

/**
 * Abuse-prevention caps for participant-writable content. Chosen well above
 * any legitimate planning-poker usage so real rooms never hit them. Each text
 * field's limit has its rule beside it (fieldRule.ts), which the model's
 * writers and the browser's inputs both read.
 */
export const MAX_ISSUES_PER_ROOM = 500;

export const MAX_PERSON_NAME_LENGTH = 50;
/** A person's name, which everyone in their rooms sees. */
export const PERSON_NAME = fieldRule({
  maxLength: MAX_PERSON_NAME_LENGTH,
  blank: "Name is required",
  tooLong: `Name must be ${MAX_PERSON_NAME_LENGTH} characters or less`,
});

export const MAX_ROOM_NAME_LENGTH = 100;
/** A room's name, poker room or retro. */
export const ROOM_NAME = fieldRule({
  maxLength: MAX_ROOM_NAME_LENGTH,
  blank: "Room name is required",
  tooLong: `Room name must be ${MAX_ROOM_NAME_LENGTH} characters or less`,
});

export const MAX_ISSUE_TITLE_LENGTH = 500;
/** An issue's title. Jira-imported titles ("KEY - summary") fit comfortably under the cap. */
export const ISSUE_TITLE = fieldRule({
  maxLength: MAX_ISSUE_TITLE_LENGTH,
  blank: "Issue title is required",
  tooLong: `Issue title must be ${MAX_ISSUE_TITLE_LENGTH} characters or less`,
});

export const MAX_NOTE_CONTENT_LENGTH = 10000;
/** An issue's discussion note: kept as typed, spaces and all, and it may be empty. */
export const DISCUSSION_NOTE = fieldRule({
  maxLength: MAX_NOTE_CONTENT_LENGTH,
  tooLong: `Note content too long (max ${MAX_NOTE_CONTENT_LENGTH} characters)`,
  trim: false,
});
