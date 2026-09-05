/**
 * The nudge button's state (spec §16.2, §19): the copy per attribution
 * and after a send, disabled at zero recipients or inside the day.
 */
import { describe, it, expect } from "vitest";
import { nudgeButtonState } from "./nudge";

const HOUR = 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 5, 12);

describe("nudgeButtonState", () => {
  it("named: Email {n} people who haven't written", () => {
    expect(nudgeButtonState({ recipientCount: 4, lastNudge: null }, "named", now)).toEqual({
      label: "Email 4 people who haven't written",
      disabled: false,
    });
    expect(nudgeButtonState({ recipientCount: 1, lastNudge: null }, "named", now).label).toBe(
      "Email 1 person who hasn't written"
    );
  });

  it("anonymous: Email {n} team members", () => {
    expect(nudgeButtonState({ recipientCount: 6, lastNudge: null }, "anonymous", now).label).toBe(
      "Email 6 team members"
    );
  });

  it("zero recipients disables it, keeping the copy", () => {
    expect(nudgeButtonState({ recipientCount: 0, lastNudge: null }, "named", now)).toEqual({
      label: "Email 0 people who haven't written",
      disabled: true,
    });
  });

  it("inside the day: Sent {ago} by {name}, disabled", () => {
    const state = nudgeButtonState(
      { recipientCount: 3, lastNudge: { at: now - 3 * HOUR, byName: "Sam" } },
      "named",
      now
    );
    expect(state).toEqual({ label: "Sent 3 hours ago by Sam", disabled: true });
  });

  it("a send stamped just ahead of the client clock reads as now, never as future", () => {
    const state = nudgeButtonState(
      { recipientCount: 3, lastNudge: { at: now + 5000, byName: "Sam" } },
      "named",
      now
    );
    expect(state.label).toBe("Sent 0 seconds ago by Sam");
  });

  it("once the day has passed the button is live again", () => {
    const state = nudgeButtonState(
      { recipientCount: 3, lastNudge: { at: now - 25 * HOUR, byName: "Sam" } },
      "anonymous",
      now
    );
    expect(state).toEqual({ label: "Email 3 team members", disabled: false });
  });
});
