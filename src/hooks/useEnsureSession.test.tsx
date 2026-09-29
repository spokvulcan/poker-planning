/**
 * useEnsureSession: a fresh guest session reaches BetterAuth before Convex,
 * so the bootstrap writes nothing and answers nothing until Convex has it.
 * The server refuses a write from a caller it can't identify.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  authUserId: null as string | null,
  isLoading: false,
  isAuthenticated: false,
  calls: [] as string[],
  waiters: null as unknown as ReturnType<typeof createAuthWaiters<AuthSnapshot>>,
}));

/** The provider's side: the auth state moved. */
function authChanged() {
  auth.waiters.update({
    authUserId: auth.authUserId,
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
  });
}

vi.mock("convex/react", () => ({
  useMutation: () => async () => {
    auth.calls.push("ensureGlobalUser");
  },
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ whenAuth: auth.waiters.when }),
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

import { createAuthWaiters } from "@/lib/auth-waiters";
import type { AuthSnapshot } from "@/components/auth/auth-provider";
import { SESSION_FAILED, useEnsureSession } from "./useEnsureSession";

beforeEach(() => {
  vi.useFakeTimers();
  auth.authUserId = null;
  auth.isLoading = false;
  auth.isAuthenticated = false;
  auth.calls = [];
  auth.waiters = createAuthWaiters<AuthSnapshot>({ authUserId: null, isLoading: false, isAuthenticated: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useEnsureSession", () => {
  it("signs a visitor in as a guest, and writes their user row only once Convex has the session", async () => {
    const { result } = renderHook(() => useEnsureSession());
    let answered: string | undefined;

    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current().then((id) => {
        answered = id;
      });
    });
    expect(auth.calls).toEqual(["signIn"]);
    expect(answered).toBeUndefined();

    auth.authUserId = "guest-1";
    auth.isAuthenticated = true;
    await act(async () => authChanged());
    await act(async () => pending);
    expect(auth.calls).toEqual(["signIn", "ensureGlobalUser"]);
    expect(answered).toBe("guest-1");
  });

  it("writes no user row for a join, which writes its own", async () => {
    const { result } = renderHook(() => useEnsureSession());

    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current({ createUser: false });
    });
    auth.authUserId = "guest-1";
    auth.isAuthenticated = true;
    await act(async () => authChanged());

    await expect(pending).resolves.toBe("guest-1");
    expect(auth.calls).toEqual(["signIn"]);
  });

  it("waits for the auth provider's first load before deciding whether to sign in", async () => {
    auth.isLoading = true;
    authChanged();
    const { result } = renderHook(() => useEnsureSession());

    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current();
    });
    expect(auth.calls).toEqual([]);

    // The load finds a live session: no anonymous sign-in over it.
    auth.isLoading = false;
    auth.authUserId = "user-1";
    auth.isAuthenticated = true;
    await act(async () => authChanged());

    await expect(pending).resolves.toBe("user-1");
    expect(auth.calls).toEqual(["ensureGlobalUser"]);
  });

  it("answers at once for a session Convex already has, making sure it has a user row", async () => {
    auth.authUserId = "user-1";
    auth.isAuthenticated = true;
    authChanged();
    const { result } = renderHook(() => useEnsureSession());

    await expect(result.current()).resolves.toBe("user-1");
    expect(auth.calls).toEqual(["ensureGlobalUser"]);
  });

  it("writes nothing for a join over a session Convex already has", async () => {
    auth.authUserId = "user-1";
    auth.isAuthenticated = true;
    authChanged();
    const { result } = renderHook(() => useEnsureSession());

    await expect(result.current({ createUser: false })).resolves.toBe("user-1");
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
    expect(auth.calls).toEqual(["signIn"]);
  });

  it("finishes the sign-in when the page unmounts the caller while Convex takes the session", async () => {
    const { result, unmount } = renderHook(() => useEnsureSession());

    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current();
    });
    unmount();
    auth.authUserId = "guest-1";
    auth.isAuthenticated = true;
    await act(async () => authChanged());

    await expect(pending).resolves.toBe("guest-1");
    expect(auth.calls).toEqual(["signIn", "ensureGlobalUser"]);
  });
});
