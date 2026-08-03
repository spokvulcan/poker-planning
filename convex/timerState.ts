import type { Id } from "./_generated/dataModel";

/**
 * timerState — the ONE declaration of the canvas timer node's persisted state
 * and its time math, kept at the Convex root (alongside `summarize`, `phase`,
 * and the permission decision) so the backend model and the browser compute
 * the same reading from the same shape. Pure: no IO, no Convex runtime.
 */

/** A control action on the timer (the transitions the model accepts). */
export type TimerAction = "start" | "pause" | "reset";

/**
 * The persisted `data` payload of a timer canvas node (stored as `v.any()`,
 * so this is the read-side contract). `isRunning` is optional only because
 * rows written before it existed omit it — readers default it to `false`.
 * Declared as an object-literal alias (not an interface) so view-side
 * compositions stay assignable to xyflow's `Record<string, unknown>` node data.
 */
export type TimerState = {
  startedAt: number | null; // server timestamp of the last start
  pausedAt: number | null; // server timestamp of the last pause
  elapsedSeconds: number; // accumulated seconds, excluding the current run
  isRunning?: boolean;
  lastUpdatedBy: Id<"users"> | null;
  lastAction: TimerAction | null;
};

/** A point-in-time reading derived from the persisted state. */
export type CurrentTimerTime = {
  currentSeconds: number;
  isRunning: boolean;
  displayTime: string; // MM:SS
};

/** Formats a (possibly fractional) second count as MM:SS. */
export function formatTimerTime(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * The current reading of a persisted timer: accumulated `elapsedSeconds` plus,
 * while running, the time since `startedAt`. `now` is injectable for tests.
 */
export function calculateCurrentTime(
  timer: TimerState,
  now: number = Date.now()
): CurrentTimerTime {
  const isRunning = timer.isRunning ?? false;
  let currentSeconds = timer.elapsedSeconds;

  if (isRunning && timer.startedAt) {
    currentSeconds += (now - timer.startedAt) / 1000;
  }

  return {
    currentSeconds: Math.floor(currentSeconds),
    isRunning,
    displayTime: formatTimerTime(currentSeconds),
  };
}

/**
 * Validates a timer transition: start requires stopped, pause requires
 * running, reset is always allowed. Throws on an invalid transition.
 */
export function validateTimerAction(
  current: TimerState,
  action: TimerAction
): void {
  switch (action) {
    case "start":
      if (current.isRunning) {
        throw new Error("Timer is already running");
      }
      break;
    case "pause":
      if (!current.isRunning) {
        throw new Error("Timer is not running");
      }
      break;
    case "reset":
      // Reset is always allowed
      break;
    default:
      throw new Error(`Invalid timer action: ${action}`);
  }
}
