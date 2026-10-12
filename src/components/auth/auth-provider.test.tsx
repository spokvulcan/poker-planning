/**
 * AuthProvider hands out who is looking at the page, the viewer: Convex's
 * auth state and its answer about the person signed in (users.getViewer, the
 * name, avatar, email and kind of account caller.ts works out), read once,
 * here, for the menus, the join gate and the pages that tell a permanent
 * account apart. A signed-in caller has no users row until their first room
 * write makes it, and is ready all the same. The viewer is confirmed once
 * Convex has authenticated the session: reads made as the viewer wait for it
 * (useCallerQuery). Until Convex first answers, the viewer the server saw for
 * the first paint stands in. The tests drive the provider's sources: Convex's
 * auth state, its answer and BetterAuth's session, which has no say in the
 * viewer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

const sources = vi.hoisted(() => ({
  // Convex's auth state
  isLoading: false,
  isAuthenticated: true,
  // Convex's answer (users.getViewer): undefined until it answers, null when nobody is signed in
  answer: undefined as Record<string, unknown> | null | undefined,
  // BetterAuth's session
  session: null as { user: Record<string, unknown> } | null,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({ isLoading: sources.isLoading, isAuthenticated: sources.isAuthenticated }),
    useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) =>
      args !== "skip" && getFunctionName(query) === "users:getViewer" ? sources.answer : undefined,
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: sources.session, isPending: false }) },
}));

import { AuthProvider, useAuth } from "./auth-provider";
import type { Viewer } from "./viewer";

/** What Convex answers for a permanent account, from its Google profile. */
const ADA = {
  name: "Ada Lovelace",
  avatarUrl: "https://lh3.googleusercontent.com/a/ada",
  email: "ada@example.com",
  isPermanent: true,
};

/** What Convex answers for a guest who only continued as one: no users row yet. */
const NEW_GUEST = { name: null, avatarUrl: null, email: null, isPermanent: false };

function viewer() {
  return renderHook(() => useAuth().viewer, { wrapper: AuthProvider }).result.current;
}

/** The viewer, under a provider handed the one the server saw. */
function viewerAfterServer(initialViewer: Viewer) {
  return renderHook(() => useAuth().viewer, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AuthProvider initialViewer={initialViewer}>{children}</AuthProvider>
    ),
  });
}

/** What the server saw of Ada: unconfirmed, as the browser's Convex hasn't authenticated the session yet. */
const ADA_ON_SERVER: Viewer = { status: "signedIn", ...ADA, confirmed: false };

beforeEach(() => {
  sources.isLoading = false;
  sources.isAuthenticated = true;
  sources.answer = undefined;
  sources.session = null;
});

afterEach(cleanup);

describe("AuthProvider's viewer", () => {
  it("is loading while Convex checks the session's token", () => {
    sources.isLoading = true;
    sources.isAuthenticated = false;

    expect(viewer()).toEqual({ status: "loading" });
  });

  it("is a visitor when nobody is signed in", () => {
    sources.isAuthenticated = false;

    expect(viewer()).toEqual({ status: "visitor" });
  });

  it("is loading while Convex's answer about the person hasn't come", () => {
    expect(viewer()).toEqual({ status: "loading" });
  });

  it("is who Convex says is signed in, confirmed", () => {
    sources.answer = ADA;

    expect(viewer()).toEqual({ status: "signedIn", ...ADA, confirmed: true });
  });

  it("is signed in, with no name, avatar or email, while the caller has no users row yet", () => {
    sources.answer = NEW_GUEST;

    expect(viewer()).toEqual({ status: "signedIn", ...NEW_GUEST, confirmed: true });
  });

  it("takes the kind of account from Convex, whatever BetterAuth's session says", () => {
    sources.answer = NEW_GUEST;
    sources.session = { user: { id: "auth-bob", isAnonymous: false, email: "bob@example.com" } };

    expect(viewer()).toMatchObject({ status: "signedIn", isPermanent: false, email: null });
  });
});

describe("AuthProvider's viewer, after the server's", () => {
  it("is the one the server saw, unconfirmed, while Convex checks the session's token", () => {
    sources.isLoading = true;
    sources.isAuthenticated = false;

    expect(viewerAfterServer(ADA_ON_SERVER).result.current).toEqual(ADA_ON_SERVER);
  });

  it("is the one the server saw, confirmed, once Convex has the session but not yet its answer", () => {
    expect(viewerAfterServer(ADA_ON_SERVER).result.current).toEqual({ ...ADA_ON_SERVER, confirmed: true });
  });

  it("is Convex's once it answers", () => {
    const { result, rerender } = viewerAfterServer(ADA_ON_SERVER);

    sources.answer = { ...ADA, name: "Ada King" };
    rerender();

    expect(result.current).toMatchObject({ status: "signedIn", name: "Ada King", confirmed: true });
  });

  it("is a visitor when Convex finds nobody signed in, whatever the server saw", () => {
    sources.isAuthenticated = false;

    expect(viewerAfterServer(ADA_ON_SERVER).result.current).toEqual({ status: "visitor" });
  });

  it("goes by Convex alone once it has answered, loading included while it checks a session that changed", () => {
    sources.answer = ADA;
    const { result, rerender } = viewerAfterServer({ status: "visitor" });

    sources.isLoading = true;
    rerender();

    expect(result.current).toEqual({ status: "loading" });
  });
});

// The rules the viewer exists for: only the auth provider reads Convex's
// auth state and its answer about the person, and the server reads the answer
// once for the first paint, so no menu or page works out who is looking
// again; pages read as the viewer through useCallerQuery, which waits for
// Convex to confirm the session; and the account kind is Convex's, from the
// session's token, so nothing in the browser reads BetterAuth's isAnonymous.
// Every module under src/ as source text, but the tests.
const modules = import.meta.glob(["../../**/*.{ts,tsx}", "!../../**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const PROVIDER = "./auth-provider.tsx";
const SERVER = "./server-viewer.ts";

/** A module's code, without its comments. */
function code(path: string): string {
  return modules[path]
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

describe("who is looking", () => {
  it("is asked of Convex by the auth provider, and the server for the first paint, only", () => {
    const asks = (path: string) => /\b(getViewer|getGlobalUser)\b/.test(code(path));
    expect(asks(PROVIDER)).toBe(true);
    expect(asks(SERVER)).toBe(true);

    expect(Object.keys(modules).filter((path) => path !== PROVIDER && path !== SERVER && asks(path))).toEqual([]);
  });

  it("is the auth provider's alone to work out from Convex's auth state: pages ask the viewer", () => {
    expect(Object.keys(modules).filter((path) => path !== PROVIDER && /\buseConvexAuth\b/.test(code(path)))).toEqual([]);
  });

  it("never takes the account kind from BetterAuth's session", () => {
    expect(Object.keys(modules).filter((path) => /\bisAnonymous\b/.test(code(path)))).toEqual([]);
  });
});
