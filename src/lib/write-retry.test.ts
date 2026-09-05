/**
 * Rollback by error kind (ADR-0022, spec §10.8): a refusal — a ConvexError
 * carrying one of the four codes — is never retried and surfaces its
 * reason; anything else is retried three times with backoff before it is
 * given up.
 */
import { describe, it, expect, vi } from "vitest";
import { ConvexError } from "convex/values";
import { defaultDelayMs, refusalOf, retryWrite, RETRY_ATTEMPTS } from "./write-retry";

describe("refusalOf", () => {
  it("reads the code and message off a ConvexError, and nothing off a plain error", () => {
    expect(refusalOf(new ConvexError({ code: "forbidden", message: "Not yours" }))).toEqual({
      code: "forbidden",
      message: "Not yours",
    });
    expect(refusalOf(new Error("network"))).toBeNull();
    expect(refusalOf(new ConvexError("odd shape"))).toBeNull();
  });
});

describe("retryWrite", () => {
  it("a refusal is thrown at once, with no retry", async () => {
    const write = vi.fn().mockRejectedValue(new ConvexError({ code: "budget", message: "Full" }));
    await expect(retryWrite(write, { delayMs: () => 0 })).rejects.toBeInstanceOf(ConvexError);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("a transient failure is retried three times, then thrown", async () => {
    const write = vi.fn().mockRejectedValue(new Error("network"));
    const delays: number[] = [];
    await expect(
      retryWrite(write, {
        delayMs: (attempt) => {
          delays.push(attempt);
          return 0;
        },
      })
    ).rejects.toThrow("network");
    expect(write).toHaveBeenCalledTimes(1 + RETRY_ATTEMPTS);
    expect(delays).toEqual([1, 2, 3]);
  });

  it("a retry that succeeds resolves with its value", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("ok");
    await expect(retryWrite(write, { delayMs: () => 0 })).resolves.toBe("ok");
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("the default backoff grows with the attempt", () => {
    expect(defaultDelayMs(1)).toBeLessThan(defaultDelayMs(2));
    expect(defaultDelayMs(2)).toBeLessThan(defaultDelayMs(3));
  });
});
