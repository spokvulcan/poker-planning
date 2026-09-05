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

/** An in-memory edit-key store with the hook's shape. */
function fakeKeys(initial: Record<string, string> = {}) {
  const keys = { ...initial };
  return {
    keys: Object.values(keys),
    keyOf: (clientId: string) => keys[clientId],
    remember: vi.fn((clientId: string, editKey: string) => void (keys[clientId] = editKey)),
    forget: vi.fn((clientId: string) => void delete keys[clientId]),
    held: keys,
  };
}
const named = () => ({ userId, anonymous: false, editKeys: fakeKeys() });

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
    const writer = named();
    const { result } = renderHook(() => useCardActions(roomId, writer));
    const outcome = result.current.create(card);
    await vi.advanceTimersByTimeAsync(400);
    expect(await outcome).toBe(true);
    expect(mocks.calls.map((c) => c.fn)).toEqual(["retro.createCard", "retro.createCard"]);
    expect(mocks.calls.map((c) => (c.args as { clientId: string }).clientId)).toEqual(["c-1", "c-1"]);
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(writer.editKeys.remember).not.toHaveBeenCalled();
  });

  it("does not retry a refusal, toasts its reason and resolves false", async () => {
    mocks.outcomes.push(() =>
      Promise.reject(new ConvexError({ code: "forbidden", message: "Not in a named retro" }))
    );
    const { result } = renderHook(() => useCardActions(roomId, named()));
    const outcome = result.current.create(card);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await outcome).toBe(false);
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.toast.error).toHaveBeenCalledWith("Not in a named retro");
  });
});

describe("useCardActions in an anonymous retro (ADR-0012)", () => {
  it("remembers the key a create returns, once, and presents it on edit, move and delete", async () => {
    mocks.outcomes.push(() => Promise.resolve({ cardId: "id-1", editKey: "key-1" }));
    const writer = { userId, anonymous: true, editKeys: fakeKeys({ "c-0": "key-0" }) };
    const { result } = renderHook(() => useCardActions(roomId, writer));

    expect(await result.current.create(card)).toBe(true);
    expect(writer.editKeys.remember).toHaveBeenCalledWith("c-1", "key-1");

    mocks.outcomes.push(() => Promise.resolve(), () => Promise.resolve(), () => Promise.resolve());
    await result.current.editText("c-1", "edited");
    result.current.move([
      { clientId: "c-0", position: { x: 1, y: 1 } },
      { clientId: "c-1", position: { x: 2, y: 2 } },
      { clientId: "other", position: { x: 3, y: 3 } },
    ]);
    result.current.remove("c-0");
    await vi.advanceTimersByTimeAsync(10);

    const argsOf = (fn: string) => mocks.calls.filter((c) => c.fn === fn).map((c) => c.args);
    expect(argsOf("retro.updateCard")).toEqual([{ roomId, clientId: "c-1", text: "edited", editKey: "key-1" }]);
    expect(argsOf("retro.moveCards")).toEqual([
      {
        roomId,
        moves: [
          { clientId: "c-0", position: { x: 1, y: 1 }, editKey: "key-0" },
          { clientId: "c-1", position: { x: 2, y: 2 }, editKey: "key-1" },
          { clientId: "other", position: { x: 3, y: 3 } },
        ],
      },
    ]);
    expect(argsOf("retro.deleteCard")).toEqual([{ roomId, clientId: "c-0", editKey: "key-0" }]);
    expect(writer.editKeys.forget).toHaveBeenCalledWith("c-0");
  });

  it("a create that returns no key remembers nothing, and a failed delete keeps the key", async () => {
    mocks.outcomes.push(
      () => Promise.resolve({ cardId: "id-1" }),
      () => Promise.reject(new ConvexError({ code: "forbidden", message: "Not yours" }))
    );
    const writer = { userId, anonymous: true, editKeys: fakeKeys({ "c-1": "key-1" }) };
    const { result } = renderHook(() => useCardActions(roomId, writer));
    expect(await result.current.create(card)).toBe(true);
    expect(writer.editKeys.remember).not.toHaveBeenCalled();
    result.current.remove("c-1");
    await vi.advanceTimersByTimeAsync(10);
    expect(writer.editKeys.forget).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith("Not yours");
  });
});
