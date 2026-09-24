/**
 * A refusal (a ConvexError carrying a code and a message) surfaces its own
 * reason; any other failure shows the caller's fallback.
 */
import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import { failureCopy } from "./refusal";

describe("failureCopy", () => {
  it("shows a refusal's reason, and the fallback for anything else", () => {
    expect(failureCopy(new ConvexError({ code: "budget", message: "You're out of votes." }), "Try again.")).toBe(
      "You're out of votes."
    );
    expect(failureCopy(new Error("[CONVEX M(retro:toggleVote)] Server Error"), "Try again.")).toBe("Try again.");
    expect(failureCopy(new ConvexError("odd shape"), "Try again.")).toBe("Try again.");
  });
});
