import { describe, it, expect } from "vitest";
import { phaseOf } from "./phase";

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
