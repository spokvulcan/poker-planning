import { calculateCurrentTime, formatTimerTime } from "@/convex/timerState";
import { TIMEBOX_OVER } from "@/convex/retroCopy";

/**
 * The advisory timebox reading (ADR-0010, spec §7): `timeboxMinutes * 60`
 * minus the seconds since the shared pointer entered the entry, computed
 * with the timer's own calculator so the board and the poker timer agree on
 * a second. At or below zero it reads "Timebox over" and nothing else
 * happens: the count never fires an advance.
 */
export interface TimeboxReading {
  over: boolean;
  /** MM:SS, or the "Timebox over" line. */
  label: string;
}

export function timeboxReading(
  timeboxMinutes: number,
  enteredAt: number,
  now: number = Date.now()
): TimeboxReading {
  const elapsed = calculateCurrentTime(
    {
      startedAt: enteredAt,
      pausedAt: null,
      elapsedSeconds: 0,
      isRunning: true,
      lastUpdatedBy: null,
      lastAction: null,
    },
    now
  ).currentSeconds;
  const remainingSeconds = timeboxMinutes * 60 - elapsed;
  const over = remainingSeconds <= 0;
  return {
    over,
    label: over ? TIMEBOX_OVER : formatTimerTime(remainingSeconds),
  };
}
