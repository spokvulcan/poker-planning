/**
 * useEnsureSession: a fresh guest session reaches BetterAuth before Convex,
 * so the bootstrap answers only once Convex has it. Otherwise the create that
 * follows it fails as unauthenticated.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  authUserId: null as string | null,
  isAuthenticated: false,
  calls: [] as string[],
}));

vi.mock("convex/react", () => ({
  useMutation: () => async () => {
    auth.calls.push("ensureGlobalUser");
  },
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authUserId: auth.authUserId, isAuthenticated: auth.isAuthenticated }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      anonymous: async () => {
        auth.calls.push("signIn");
        return { data: { user: { id: "guest-1" } }, error: null };
      },
    },
  },
}));

import { SESSION_FAILED, useEnsureSession } from "./useEnsureSession";

beforeEach(() => {
  vi.useFakeTimers();
  auth.authUserId = null;
  auth.isAuthenticated = false;
  auth.calls = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useEnsureSession", () => {
  it("signs a visitor in as a guest and answers once Convex has the session", async () => {
    const { result, rerender } = renderHook(() => useEnsureSession());
    let answered: string | undefined;

    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current().then((id) => {
        answered = id;
      });
    });
    expect(auth.calls).toEqual(["signIn", "ensureGlobalUser"]);
    expect(answered).toBeUndefined();

    auth.authUserId = "guest-1";
    auth.isAuthenticated = true;
    await act(async () => rerender());
    await act(async () => pending);
    expect(answered).toBe("guest-1");
  });

  it("answers at once for a session Convex already has", async () => {
    auth.authUserId = "user-1";
    auth.isAuthenticated = true;
    const { result } = renderHook(() => useEnsureSession());

    await expect(result.current()).resolves.toBe("user-1");
    expect(auth.calls).toEqual([]);
  });

  it("gives up with the session message when Convex never takes the session", async () => {
    const { result } = renderHook(() => useEnsureSession());
    let failure: unknown;

    await act(async () => {
      void result.current().catch((error) => {
        failure = error;
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect((failure as Error).message).toBe(SESSION_FAILED);
  });
});
