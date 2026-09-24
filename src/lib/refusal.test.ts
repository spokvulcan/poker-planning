/**
 * A refusal (a ConvexError carrying one of the four codes) surfaces its own
 * reason; any other failure shows the caller's fallback.
 */
import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import { failureCopy, refusalOf } from "./refusal";

describe("refusalOf", () => {
  it("reads the code and message off a ConvexError, and nothing off a plain error", () => {
    expect(refusalOf(new ConvexError({ code: "forbidden", message: "Not yours" }))).toEqual({
      code: "forbidden",
      message: "Not yours",
    });
    expect(refusalOf(new Error("network"))).toBeNull();
    expect(refusalOf(new ConvexError("odd shape"))).toBeNull();
    expect(refusalOf(new ConvexError({ code: "teapot", message: "?" }))).toBeNull();
  });
});

describe("failureCopy", () => {
  it("shows a refusal's reason, and the fallback for anything else", () => {
    expect(failureCopy(new ConvexError({ code: "budget", message: "You're out of votes." }), "Try again.")).toBe(
      "You're out of votes."
    );
    expect(failureCopy(new Error("[CONVEX M(retro:toggleVote)] Server Error"), "Try again.")).toBe("Try again.");
  });
});
