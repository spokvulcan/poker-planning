/**
 * ConvexSessionProvider signs Convex in with the browser's BetterAuth
 * session: it tells Convex whether its auth is loading and whether someone is
 * signed in, and hands it the session's token when it asks, starting from the
 * token the server fetched for the first render. Only an answer signs a
 * person out: a session or a token the browser couldn't fetch (Convex
 * unreachable) is asked for again, waiting longer each time, and Convex waits
 * meanwhile. The tests drive BetterAuth's session and the auth route's
 * answers to the token fetch, and read what Convex is told.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

interface SessionState {
  data: { user: { id: string } } | null;
  error: { status?: number } | null;
  isPending: boolean;
}

/** The auth route's answer to a token fetch, or none at all (the request fails). */
type TokenAnswer = { data: { token: string } | null; error: { status: number } | null } | "no answer";

interface ConvexAuth {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: (args: { forceRefreshToken: boolean }) => Promise<string | null | undefined>;
}

const browser = vi.hoisted(() => {
  const browser = {
    // BetterAuth's session, and how often it was asked for again
    session: { data: null, error: null, isPending: true } as SessionState,
    sessionFetches: 0,
    refetch: async () => {
      browser.sessionFetches++;
    },
    // The auth route's answers to the token fetches, in turn
    tokenAnswers: [] as TokenAnswer[],
    tokenFetches: 0,
    // How the provider hears the session move
    version: 0,
    listeners: new Set<() => void>(),
    // What Convex was last told
    convex: null as ConvexAuth | null,
  };
  return browser;
});

vi.mock("@/lib/auth-client", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    browser.listeners.add(listener);
    return () => browser.listeners.delete(listener);
  };
  return {
    authClient: {
      useSession: () => {
        useSyncExternalStore(subscribe, () => browser.version);
        return { ...browser.session, refetch: browser.refetch };
      },
      convex: {
        token: async () => {
          browser.tokenFetches++;
          const answer = browser.tokenAnswers.shift();
          if (!answer || answer === "no answer") throw new TypeError("Failed to fetch");
          return answer;
        },
      },
    },
  };
});

// Convex's side: what it asks the provider for as it renders.
vi.mock("convex/react", () => ({
  ConvexProviderWithAuth: ({ useAuth, children }: { useAuth: () => ConvexAuth; children: ReactNode }) => {
    browser.convex = useAuth();
    return children;
  },
}));

import { ConvexSessionProvider } from "./convex-session";

const LOADING: SessionState = { data: null, error: null, isPending: true };
const NONE: SessionState = { data: null, error: null, isPending: false };
const UNREACHABLE: SessionState = { data: null, error: { status: 500 }, isPending: false };
const live = (id: string): SessionState => ({ data: { user: { id } }, error: null, isPending: false });

/** BetterAuth's session moved. */
async function sessionIs(state: SessionState) {
  browser.session = state;
  browser.version++;
  await act(async () => {
    for (const listener of browser.listeners) listener();
  });
}

function mount(initialToken?: string) {
  return render(
    <ConvexSessionProvider client={{} as ConvexReactClient} initialToken={initialToken}>
      <p>A page</p>
    </ConvexSessionProvider>,
  );
}

/** What Convex was last told. */
function told() {
  return browser.convex!;
}

/** Lets `ms` pass, and whatever was waiting on it run. */
async function pass(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

/** A token Convex asked for, and whether the provider has answered yet. */
function ask(forceRefreshToken: boolean) {
  const asked = { answered: false, token: undefined as string | null | undefined };
  void told()
    .fetchAccessToken({ forceRefreshToken })
    .then((token) => Object.assign(asked, { answered: true, token }));
  return asked;
}

beforeEach(() => {
  vi.useFakeTimers();
  browser.session = LOADING;
  browser.sessionFetches = 0;
  browser.tokenAnswers = [];
  browser.tokenFetches = 0;
  browser.convex = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ConvexSessionProvider tells Convex", () => {
  it("its auth is loading while BetterAuth's session loads", () => {
    mount();

    expect(told()).toMatchObject({ isLoading: true, isAuthenticated: false });
  });

  it("someone is signed in while BetterAuth holds a session, and nobody once it answers there is none", async () => {
    mount();

    await sessionIs(live("user-1"));
    expect(told()).toMatchObject({ isLoading: false, isAuthenticated: true });

    await sessionIs(NONE);
    expect(told()).toMatchObject({ isLoading: false, isAuthenticated: false });
  });

  it("someone is signed in with the server's token while BetterAuth's session loads, and hands it that token until it asks for a fresh one", async () => {
    browser.tokenAnswers = [{ data: { token: "fresh-token" }, error: null }];
    mount("server-token");

    expect(told()).toMatchObject({ isLoading: false, isAuthenticated: true });
    const cached = ask(false);
    await pass(0);
    expect(cached).toEqual({ answered: true, token: "server-token" });
    expect(browser.tokenFetches).toBe(0);

    const fresh = ask(true);
    await pass(0);
    expect(fresh).toEqual({ answered: true, token: "fresh-token" });
  });

  it("nobody is signed in once BetterAuth answers there is no session, whatever token the server fetched", async () => {
    mount("server-token");

    await sessionIs(NONE);

    expect(told()).toMatchObject({ isLoading: false, isAuthenticated: false });
  });
});

describe("ConvexSessionProvider, while the browser can't fetch the session", () => {
  it("keeps Convex's auth loading, never signed out", async () => {
    mount();

    await sessionIs(UNREACHABLE);

    expect(told()).toMatchObject({ isLoading: true, isAuthenticated: false });
  });

  it("asks BetterAuth for the session again, waiting longer each time, until it answers", async () => {
    mount();
    await sessionIs(UNREACHABLE);

    await pass(999);
    expect(browser.sessionFetches).toBe(0);
    await pass(1);
    expect(browser.sessionFetches).toBe(1);

    // That fetch failed too: the next waits twice as long.
    await sessionIs(LOADING);
    await sessionIs(UNREACHABLE);
    await pass(1_999);
    expect(browser.sessionFetches).toBe(1);
    await pass(1);
    expect(browser.sessionFetches).toBe(2);

    // BetterAuth answers: nobody is signed in, and nothing is asked again.
    await sessionIs(NONE);
    await pass(60_000);
    expect(browser.sessionFetches).toBe(2);
    expect(told()).toMatchObject({ isLoading: false, isAuthenticated: false });
  });

  it("takes a 401 for BetterAuth's answer that there is no session", async () => {
    mount();

    await sessionIs({ data: null, error: { status: 401 }, isPending: false });
    await pass(60_000);

    expect(told()).toMatchObject({ isLoading: false, isAuthenticated: false });
    expect(browser.sessionFetches).toBe(0);
  });

  it("signs Convex in with the server's token meanwhile", async () => {
    mount("server-token");

    await sessionIs(UNREACHABLE);

    expect(told()).toMatchObject({ isLoading: false, isAuthenticated: true });
  });

  it("stops asking when it unmounts", async () => {
    const { unmount } = mount();
    await sessionIs(UNREACHABLE);

    unmount();
    await pass(60_000);

    expect(browser.sessionFetches).toBe(0);
  });
});

describe("ConvexSessionProvider, asked for the session's token", () => {
  beforeEach(() => {
    browser.session = live("user-1");
  });

  it("asks the auth route again while it can't answer, waiting longer each time, Convex waiting meanwhile", async () => {
    browser.tokenAnswers = [{ data: null, error: { status: 500 } }, "no answer", { data: { token: "token-1" }, error: null }];
    mount();

    const asked = ask(true);
    await pass(0);
    expect(browser.tokenFetches).toBe(1);
    await pass(1_000);
    expect(browser.tokenFetches).toBe(2);
    expect(asked.answered).toBe(false);
    await pass(2_000);

    expect(browser.tokenFetches).toBe(3);
    expect(asked).toEqual({ answered: true, token: "token-1" });
  });

  it("hands Convex no token once the auth route answers there is no session", async () => {
    browser.tokenAnswers = [{ data: null, error: { status: 401 } }];
    mount();

    const asked = ask(true);
    await pass(0);

    expect(asked).toEqual({ answered: true, token: null });
  });

  it("shares a fetch still asking with every ask for the same user, and begins another for a new user", async () => {
    browser.tokenAnswers = [{ data: null, error: { status: 500 } }];
    mount();

    ask(true);
    ask(false);
    await pass(0);
    expect(browser.tokenFetches).toBe(1);

    await sessionIs(live("user-2"));
    ask(false);
    await pass(0);
    expect(browser.tokenFetches).toBe(2);
  });

  it("stops asking when it unmounts", async () => {
    const { unmount } = mount();
    const asked = ask(true);
    await pass(0);

    unmount();
    await pass(60_000);

    expect(browser.tokenFetches).toBe(1);
    expect(asked).toEqual({ answered: true, token: null });
  });
});
