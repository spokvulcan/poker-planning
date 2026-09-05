/**
 * The copy register (spec §19, ADR-0024): every line the spec fixes is in
 * the plain retro copy module verbatim, and nothing in that module speaks
 * the words the standing refusals forbid. Runs in the node project so the
 * strings stay importable without a Convex runtime. Homepage and features
 * copy are #300's test; the structural refusals (nothing time-based,
 * nothing per person, no colour by value) are a review item, not a test.
 */
import { describe, it, expect } from "vitest";
import * as copy from "@/convex/retroCopy";

const REGISTER: [string, string][] = [
  ["Board header, team retro", "Kept by Acme Squad. Its members can read this later, until the retro or the team is deleted."],
  ["Board header, teamless", "Not kept by a team. This retro disappears after 5 quiet days."],
  ["Composer, named", "Posted as Bea. Your name stays with this card."],
  ["Composer, anonymous", "Anonymous. Your name is not saved with this card, not even for the facilitator. Edit or delete it from this device."],
  ["Composer, hidden, named", "Only you can read this for now. Others can see you've added a card, not what it says. Everyone reads it once cards are revealed."],
  ["Composer, hidden, anonymous", "Only you can read this for now. Everyone reads it once cards are revealed."],
  ["Composer, visible", "Everyone in the retro can read this now."],
  ["Vote UI, anonymous", "Nobody is shown how you voted."],
  ["Ratchet confirm", "Make this retro anonymous? Every author is removed permanently and this cannot be undone."],
  ["Delete retro confirm", "Delete this retro? 47 cards, 3 open action items and its history are removed permanently. This cannot be undone."],
  ["Delete team confirm", "Delete Acme Squad? Its 14 retros and their action items are removed permanently. This cannot be undone."],
  ["Dissolve cluster with dots", "Dissolve this group? Its 3 votes are removed."],
  ["Last admin leave/demote", "Make someone else an admin first, or delete the team."],
  ["Claim denied", "The owner is still here — ask them to transfer ownership."],
  ["Join denied, permanent", "This retro is for signed-in accounts. Sign in to join."],
  ["Join denied, team", "This retro is for members of Acme Squad. Ask an admin for the invite link."],
  ["Nudge button, named", "Email 4 people who haven't written"],
  ["Nudge button, anonymous", "Email 4 team members"],
  ["Nudge button, sent", "Sent 2 hours ago by Bea"],
  ["Create form checkbox", "Email the team that it's open"],
  ["Settings toggle", "Email me about retros and action items"],
  ["Unsubscribe page", "You won't get retro or action emails. Turn them back on in Settings."],
  ["Delete account", "Your account is removed. Cards and action items you wrote in team retros stay with those teams, without your name."],
  ["Close panel facts", "3 actions, 2 unowned"],
  ["Unowned action", "Nobody owns this yet"],
  ["Coverage readout", "7 of 10 covered · 1 new"],
  ["History row counts", "3 open · 2 done · 1 dropped"],
  ["Team count line", "3 open · 12 done · 2 dropped across 14 retros"],
  ["Review empty state", "No open actions from earlier retros"],
  ["Missing user", "Former member"],
  ["Timebox over", "Timebox over"],
  ["Collect hint, listing", "You haven't added a card yet"],
];

/** The module's line for each register entry, called with the register's example arguments. */
const RENDERED: Record<string, string> = {
  "Board header, team retro": copy.keptByTeam("Acme Squad"),
  "Board header, teamless": copy.TEAMLESS_DISCLOSURE,
  "Composer, named": copy.postedAs("Bea"),
  "Composer, anonymous": copy.COMPOSER_ANONYMOUS,
  "Composer, hidden, named": copy.COMPOSER_HIDDEN_NAMED,
  "Composer, hidden, anonymous": copy.COMPOSER_HIDDEN_ANONYMOUS,
  "Composer, visible": copy.COMPOSER_VISIBLE,
  "Vote UI, anonymous": copy.VOTE_ANONYMOUS_NOTE,
  "Ratchet confirm": `${copy.RATCHET_TITLE} ${copy.RATCHET_DESCRIPTION}`,
  "Delete retro confirm": `${copy.DELETE_TITLE} ${copy.deleteRetroConfirm(47, 3)}`,
  "Delete team confirm": `${copy.deleteTeamTitle("Acme Squad")} ${copy.deleteTeamConfirm(14)}`,
  "Dissolve cluster with dots": copy.dissolveClusterConfirm(3),
  "Last admin leave/demote": copy.LAST_ADMIN_MESSAGE,
  "Claim denied": copy.CLAIM_DENIED,
  "Join denied, permanent": copy.JOIN_DENIED_PERMANENT,
  "Join denied, team": copy.joinDeniedTeam("Acme Squad"),
  "Nudge button, named": copy.nudgeNonWriters(4),
  "Nudge button, anonymous": copy.nudgeTeamMembers(4),
  "Nudge button, sent": copy.nudgeSent("2 hours ago", "Bea"),
  "Create form checkbox": copy.EMAIL_TEAM_OPEN_LABEL,
  "Settings toggle": copy.EMAIL_OPT_IN_LABEL,
  "Unsubscribe page": copy.UNSUBSCRIBED,
  "Delete account": copy.ACCOUNT_DELETED,
  "Close panel facts": copy.closeFacts(3, 2),
  "Unowned action": copy.UNOWNED_ACTION,
  "Coverage readout": copy.coverageReadout(7, 10, 1),
  "History row counts": copy.historyRowCounts(3, 2, 1),
  "Team count line": copy.teamCountLine(3, 12, 2, 14),
  "Review empty state": copy.REVIEW_EMPTY,
  "Missing user": copy.FORMER_MEMBER,
  "Timebox over": copy.TIMEBOX_OVER,
  "Collect hint, listing": copy.COLLECT_HINT_NO_CARD,
};

describe("the copy register (spec §19)", () => {
  it.each(REGISTER)("%s is in the retro copy module verbatim", (where, line) => {
    expect(RENDERED[where]).toBe(line);
  });

  it("names every register entry once", () => {
    expect(Object.keys(RENDERED).sort()).toEqual(REGISTER.map(([where]) => where).sort());
  });
});

/**
 * Every string the module can produce: its constants, its records, and its
 * functions called with sample arguments (numbers 0, 1 and 3 for a count,
 * a name for a string, a list of groups for the group namer).
 */
function everyString(): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  const push = (name: string, value: unknown) => {
    if (typeof value === "string") out.push({ name, text: value });
    else if (Array.isArray(value)) value.forEach((v, i) => push(`${name}[${i}]`, v));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) push(`${name}.${k}`, v);
    }
  };
  for (const [name, value] of Object.entries(copy)) {
    if (typeof value === "function") {
      const fn = value as (...args: unknown[]) => unknown;
      const sampleArgs: unknown[][] = [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [3, 12, 2, 14],
        ["Acme Squad", "Bea"],
        [new Date(2026, 8, 5)],
        [[{ name: "Group 2" }, { name: "Themes" }]],
      ];
      for (const args of sampleArgs) {
        try {
          push(`${name}(${JSON.stringify(args)})`, fn(...args));
        } catch {
          // A sample outside the function's domain; the other samples cover it.
        }
      }
    } else {
      push(name, value);
    }
  }
  return out;
}

/**
 * The word-level refusals (ADR-0024, spec §17, §18.4): a rate, a percentage,
 * a score, a streak, a trend, a comparison to a previous retro, and the two
 * product words that never appear.
 */
const FORBIDDEN: [string, RegExp][] = [
  ["insights", /\binsights?\b/i],
  ["notification", /\bnotifications?\b/i],
  ["rate", /\brates?\b|\brated\b|\brating\b/i],
  ["percent", /\bpercent(age)?s?\b|%/i],
  ["score", /\bscores?\b|\bscored\b|\bscoring\b/i],
  ["streak", /\bstreaks?\b/i],
  ["trend", /\btrends?\b|\btrending\b/i],
  [
    "comparative phrasing",
    /\b(up|down) from\b|\b(better|worse) than\b|\b(more|fewer|less) than (the )?(last|previous|before)\b|\blast (time|retro|sprint)\b|\bprevious retro\b|\bimprov(e|ed|ing|ement)\b/i,
  ],
];

describe("the standing refusals, word level (ADR-0024)", () => {
  const strings = everyString();

  it("reads a sizeable module", () => {
    expect(strings.length).toBeGreaterThan(100);
  });

  it.each(FORBIDDEN)("no line says %s", (_label, pattern) => {
    const offenders = strings.filter(({ text }) => pattern.test(text)).map(({ name, text }) => `${name}: ${text}`);
    expect(offenders).toEqual([]);
  });
});
