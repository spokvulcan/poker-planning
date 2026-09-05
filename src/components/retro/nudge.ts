import { formatDistanceStrict } from "date-fns";
import { NUDGE_WINDOW_MS, type NudgeStatus } from "@/convex/model/retroNudge";
import { nudgeNonWriters, nudgeSent, nudgeTeamMembers } from "@/convex/retroCopy";
import type { Attribution } from "@/convex/permissions";

export interface NudgeButtonState {
  label: string;
  disabled: boolean;
}

/**
 * The nudge button (spec §16.2, §19): "Email {n} people who haven't
 * written" in a named retro, "Email {n} team members" in an anonymous
 * one, and "Sent {ago} by {name}" until the day passes. Disabled at zero
 * recipients or inside the window; the server enforces both again.
 */
export function nudgeButtonState(
  status: NudgeStatus,
  attribution: Attribution,
  now: number
): NudgeButtonState {
  const last = status.lastNudge;
  if (last && now - last.at < NUDGE_WINDOW_MS) {
    // A send stamped by the server can sit ahead of a client clock read a beat earlier.
    const seen = Math.max(now, last.at);
    return {
      label: nudgeSent(formatDistanceStrict(last.at, seen, { addSuffix: true }), last.byName),
      disabled: true,
    };
  }
  const n = status.recipientCount;
  return {
    label: attribution === "named" ? nudgeNonWriters(n) : nudgeTeamMembers(n),
    disabled: n === 0,
  };
}
