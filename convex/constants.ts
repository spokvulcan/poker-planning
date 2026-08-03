/**
 * Shared constants used across both frontend and backend
 */

/**
 * Duration for auto-reveal countdown in milliseconds
 */
export const COUNTDOWN_DURATION_MS = 3000; // 3 seconds

/**
 * Abuse-prevention caps for participant-writable content. Chosen well above
 * any legitimate planning-poker usage so real rooms never hit them.
 */
export const MAX_ROOM_NAME_LENGTH = 100;
export const MAX_ISSUE_TITLE_LENGTH = 500;
export const MAX_ISSUES_PER_ROOM = 500;
