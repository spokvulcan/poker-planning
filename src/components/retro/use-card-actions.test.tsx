/**
 * The card writes (ADR-0022): a create that fails transiently is retried
 * with the same `clientId`, so the server's dedupe makes the retry a no-op
 * rather than a second card; a refusal is not retried and toasts its reason.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown }[],
  outcomes: [] as (() => Promise<unknown>)[],
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    retro: {
      createCard: "retro.createCard",
      updateCard: "retro.updateCard",
      moveCards: "retro.moveCards",
      deleteCard: "retro.deleteCard",
    },
  },
}));
vi.mock("convex/react", () => ({
  useMutation: (ref: string) => {
    const fn = async (args: unknown) => {
      mocks.calls.push({ fn: ref, args });
      const next = mocks.outcomes.shift();
      return next ? await next() : undefined;
    };
    return Object.assign(fn, { withOptimisticUpdate: () => fn });
  },
}));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));

import { useCardActions } from "./use-card-actions";

const roomId = "room1" as Id<"rooms">;
const userId = "user1" as Id<"users">;
const card = { clientId: "c-1", text: "hi", promptId: "p1", position: { x: 1, y: 2 } };

beforeEach(() => {
  vi.useFakeTimers();
  mocks.calls.length = 0;
  mocks.outcomes.length = 0;
  mocks.toast.error.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("useCardActions.create", () => {
  it("retries a transient failure with the same clientId and resolves true", async () => {
    mocks.outcomes.push(() => Promise.reject(new Error("network")), () => Promise.resolve("id-1"));
    const { result } = renderHook(() => useCardActions(roomId, userId));
    const outcome = result.current.create(card);
    await vi.advanceTimersByTimeAsync(400);
    expect(await outcome).toBe(true);
    expect(mocks.calls.map((c) => c.fn)).toEqual(["retro.createCard", "retro.createCard"]);
    expect(mocks.calls.map((c) => (c.args as { clientId: string }).clientId)).toEqual(["c-1", "c-1"]);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("does not retry a refusal, toasts its reason and resolves false", async () => {
    mocks.outcomes.push(() =>
      Promise.reject(new ConvexError({ code: "forbidden", message: "Not in a named retro" }))
    );
    const { result } = renderHook(() => useCardActions(roomId, userId));
    const outcome = result.current.create(card);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await outcome).toBe(false);
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.toast.error).toHaveBeenCalledWith("Not in a named retro");
  });
});
