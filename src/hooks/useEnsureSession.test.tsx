/**
 * useEnsureSession, under the real auth provider. The provider merges two
 * sources that load separately, and the tests drive those: BetterAuth's
 * session, which names the session's user, and Convex's auth state, which
 * says whether Convex has the session's token. With the server-rendered
 * token Convex can load before BetterAuth's session, so the bootstrap
 * decides nothing until both have. A fresh guest session reaches BetterAuth
 * before Convex, so the bootstrap writes nothing and answers nothing until
 * Convex has it: the server refuses a write from a caller it can't identify.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

const auth = vi.hoisted(() => ({
  // BetterAuth's session
  authUserId: null as string | null,
  isSessionPending: false,
  // Convex's auth state
  isLoading: false,
  isAuthenticated: false,
  calls: [] as string[],
  // How the provider hears a source move (authChanged)
  version: 0,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    auth.listeners.add(listener);
    return () => auth.listeners.delete(listener);
  },
}));

/** The sources' side: BetterAuth's session or Convex's auth state moved. */
function authChanged() {
  auth.version++;
  for (const listener of auth.listeners) listener();
}

vi.mock("convex/react", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useConvexAuth: () => {
      useSyncExternalStore(auth.subscribe, () => auth.version);
      return { isLoading: auth.isLoading, isAuthenticated: auth.isAuthenticated };
    },
    useQuery: () => undefined,
    useMutation: () => async () => {
      auth.calls.push("ensureGlobalUser");
    },
  };
});

// The provider keeps its users-row read off /demo (ADR-0003).
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

vi.mock("@/lib/auth-client", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    authClient: {
      useSession: () => {
        useSyncExternalStore(auth.subscribe, () => auth.version);
        return {
          data: auth.authUserId ? { user: { id: auth.authUserId } } : null,
          isPending: auth.isSessionPending,
        };
      },
      signIn: {
        anonymous: async () => {
          auth.calls.push("signIn");
          return { data: { user: { id: "guest-1" } }, error: null };
        },
      },
    },
  };
});

import { AuthProvider } from "@/components/auth/auth-provider";
import { SESSION_FAILED, useEnsureSession } from "./useEnsureSession";

/** The bootstrap as a page holds it: under the auth provider. */
function renderEnsureSession() {
  return renderHook(() => useEnsureSession(), { wrapper: AuthProvider });
}

beforeEach(() => {
  vi.useFakeTimers();
  auth.authUserId = null;
  auth.isSessionPending = false;
  auth.isLoading = false;
  auth.isAuthenticated = false;
  auth.calls = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useEnsureSession", () => {
  it("signs a visitor in as a guest, and writes their user row only once Convex has the session", async () => {
    const { result } = renderEnsureSession();
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
    const { result } = renderEnsureSession();

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
    auth.isSessionPending = true;
    auth.isLoading = true;
    const { result } = renderEnsureSession();

    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current();
    });
    expect(auth.calls).toEqual([]);

    // The load finds a live session: no anonymous sign-in over it.
    auth.isSessionPending = false;
    auth.isLoading = false;
    auth.authUserId = "user-1";
    auth.isAuthenticated = true;
    await act(async () => authChanged());

    await expect(pending).resolves.toBe("user-1");
    expect(auth.calls).toEqual(["ensureGlobalUser"]);
  });

  it("decides nothing while BetterAuth's session loads, though Convex has loaded from the server-rendered token", async () => {
    auth.isSessionPending = true;
    auth.isAuthenticated = true;
    const { result } = renderEnsureSession();

    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current();
    });
    expect(auth.calls).toEqual([]);

    // BetterAuth's session is the live one Convex already has: no anonymous sign-in over it.
    auth.isSessionPending = false;
    auth.authUserId = "user-1";
    await act(async () => authChanged());

    await expect(pending).resolves.toBe("user-1");
    expect(auth.calls).toEqual(["ensureGlobalUser"]);
  });

  it("decides nothing while Convex's auth state loads, though BetterAuth's session has loaded", async () => {
    auth.isLoading = true;
    const { result } = renderEnsureSession();

    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current({ createUser: false });
    });
    expect(auth.calls).toEqual([]);

    // Convex has no session either: now the visitor signs in as a guest.
    auth.isLoading = false;
    await act(async () => authChanged());
    expect(auth.calls).toEqual(["signIn"]);

    auth.authUserId = "guest-1";
    auth.isAuthenticated = true;
    await act(async () => authChanged());
    await expect(pending).resolves.toBe("guest-1");
  });

  it("answers at once for a session Convex already has, making sure it has a user row", async () => {
    auth.authUserId = "user-1";
    auth.isAuthenticated = true;
    const { result } = renderEnsureSession();

    await expect(result.current()).resolves.toBe("user-1");
    expect(auth.calls).toEqual(["ensureGlobalUser"]);
  });

  it("writes nothing for a join over a session Convex already has", async () => {
    auth.authUserId = "user-1";
    auth.isAuthenticated = true;
    const { result } = renderEnsureSession();

    await expect(result.current({ createUser: false })).resolves.toBe("user-1");
    expect(auth.calls).toEqual([]);
  });


  it("gives up with the session message when Convex never takes the session", async () => {
    const { result } = renderEnsureSession();
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
    // The page drops the caller; the auth provider above it stays.
    let showsCaller = true;
    function Page({ children }: { children: ReactNode }) {
      return <AuthProvider>{showsCaller ? children : null}</AuthProvider>;
    }
    const { result, rerender } = renderHook(() => useEnsureSession(), { wrapper: Page });

    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current();
    });
    showsCaller = false;
    rerender();
    auth.authUserId = "guest-1";
    auth.isAuthenticated = true;
    await act(async () => authChanged());

    await expect(pending).resolves.toBe("guest-1");
    expect(auth.calls).toEqual(["signIn", "ensureGlobalUser"]);
  });
});
