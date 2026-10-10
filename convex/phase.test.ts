import { describe, it, expect } from "vitest";
import type { Doc } from "./_generated/dataModel";
import { phaseAllows, phaseOf, startAllowed, type Phase, type RoundAct } from "./phase";

type IssueStatus = Doc<"issues">["status"];

describe("phaseOf", () => {
  it("is `voting` for an unrevealed round with no countdown", () => {
    expect(phaseOf({ isGameOver: false })).toBe("voting");
  });

  it("is `countingDown` while the auto-reveal countdown is armed", () => {
    expect(
      phaseOf({ isGameOver: false, autoRevealCountdownStartedAt: 123 })
    ).toBe("countingDown");
  });

  it("is `revealed` once the round is settled", () => {
    expect(phaseOf({ isGameOver: true })).toBe("revealed");
  });

  it("is `revealed` even if a countdown field lingers (revealed wins)", () => {
    expect(
      phaseOf({ isGameOver: true, autoRevealCountdownStartedAt: 123 })
    ).toBe("revealed");
  });
});

// What each phase allows: the one table the round's refusals read.
const PHASES: Phase[] = ["voting", "countingDown", "revealed"];

describe("phaseAllows", () => {
  // A round reveals once, and its votes close at the reveal. A reveal from
  // `countingDown` is open, since it cancels the countdown first; a reset and
  // an abandon are open in every phase, so they aren't acts here.
  const table: Record<RoundAct, Record<Phase, boolean>> = {
    reveal: { voting: true, countingDown: true, revealed: false },
    vote: { voting: true, countingDown: true, revealed: false },
  };

  for (const [act, byPhase] of Object.entries(table) as [RoundAct, Record<Phase, boolean>][]) {
    for (const phase of PHASES) {
      it(`${byPhase[phase] ? "allows" : "refuses"} ${act} in ${phase}`, () => {
        expect(phaseAllows(phase, act)).toBe(byPhase[phase]);
      });
    }
  }
});

describe("startAllowed", () => {
  // A start reads its target's status, not the phase: the issue already being
  // voted on can't be started again, while any other can, a completed one
  // included (it is voted on again).
  const table: Record<IssueStatus, boolean> = { pending: true, voting: false, completed: true };

  for (const [status, allowed] of Object.entries(table) as [IssueStatus, boolean][]) {
    it(`${allowed ? "starts" : "refuses to start"} an issue that is ${status}`, () => {
      expect(startAllowed({ status })).toBe(allowed);
    });
  }
});
