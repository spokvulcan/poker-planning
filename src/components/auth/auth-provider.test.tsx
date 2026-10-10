/**
 * AuthProvider hands out who is looking at the page, the viewer: Convex's
 * auth state and the caller's users row, read once, here, for the menus, the
 * join gate and the pages that tell a permanent account apart. A signed-in
 * caller has no row until their first room write makes it, and is ready all
 * the same. The tests drive the provider's sources: Convex's auth state, the
 * caller's users row (users.getGlobalUser) and BetterAuth's session, which
 * has no say in the viewer: the account kind is the row's only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";

const sources = vi.hoisted(() => ({
  // Convex's auth state
  isLoading: false,
  isAuthenticated: true,
  // The caller's users row: undefined until it answers, null while they have none
  row: undefined as Record<string, unknown> | null | undefined,
  // BetterAuth's session
  session: null as { user: Record<string, unknown> } | null,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({ isLoading: sources.isLoading, isAuthenticated: sources.isAuthenticated }),
    useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) =>
      args !== "skip" && getFunctionName(query) === "users:getGlobalUser" ? sources.row : undefined,
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: sources.session, isPending: false }) },
}));

import { AuthProvider, useAuth } from "./auth-provider";

/** A permanent account's row, made from its Google profile. */
const ADA = {
  _id: "user-ada",
  authUserId: "auth-ada",
  name: "Ada Lovelace",
  email: "ada@example.com",
  avatarUrl: "https://lh3.googleusercontent.com/a/ada",
  accountType: "permanent",
  createdAt: 0,
};

/** A guest's row, made on their first room write. */
const GUEST = { _id: "user-guest", authUserId: "auth-guest", name: "Guest 4829", accountType: "anonymous", createdAt: 0 };

/** A guest's row made before the server made rows: it has no kind. */
const OLDER_GUEST = { _id: "user-bob", authUserId: "auth-bob", name: "Bob", createdAt: 0 };

/** What BetterAuth's session says of a permanent account. */
const PERMANENT_SESSION = { user: { id: "auth-bob", isAnonymous: false, email: "bob@example.com" } };

function viewer() {
  return renderHook(() => useAuth().viewer, { wrapper: AuthProvider }).result.current;
}

beforeEach(() => {
  sources.isLoading = false;
  sources.isAuthenticated = true;
  sources.row = undefined;
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

  it("is loading while the caller's users row hasn't answered", () => {
    expect(viewer()).toEqual({ status: "loading" });
  });

  it("is signed in, with no name, avatar or email, while the caller has no users row yet", () => {
    sources.row = null;
    sources.session = { user: { id: "auth-new", isAnonymous: true } };

    expect(viewer()).toEqual({ status: "signedIn", name: null, avatarUrl: null, email: null, isPermanent: false });
  });

  it("has the name, avatar and email of the caller's users row", () => {
    sources.row = ADA;

    expect(viewer()).toEqual({
      status: "signedIn",
      name: "Ada Lovelace",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
      email: "ada@example.com",
      isPermanent: true,
    });
  });

  it.each([
    ["a guest's row", GUEST, { user: { id: "auth-guest", isAnonymous: true } }],
    ["a guest's row with no kind, whatever BetterAuth's session says", OLDER_GUEST, PERMANENT_SESSION],
    ["no users row yet, whatever BetterAuth's session says", null, PERMANENT_SESSION],
  ])("is not a permanent account, and has no email, with %s", (_, row, session) => {
    sources.row = row;
    sources.session = session;

    expect(viewer()).toMatchObject({ status: "signedIn", isPermanent: false, email: null });
  });
});

// The rules the viewer exists for: only the auth provider subscribes to the
// caller's users row, so no menu or page works out who is looking again, and
// the account kind is the row's, so nothing reads BetterAuth's isAnonymous.
// Every module under src/ as source text, but the tests.
const modules = import.meta.glob(["../../**/*.{ts,tsx}", "!../../**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const PROVIDER = "./auth-provider.tsx";

/** A module's code, without its comments. */
function code(path: string): string {
  return modules[path]
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

describe("who is looking", () => {
  it("is read from the caller's users row by the auth provider only", () => {
    const readsTheRow = (path: string) => /\bgetGlobalUser\b/.test(code(path));
    expect(readsTheRow(PROVIDER)).toBe(true);

    expect(Object.keys(modules).filter((path) => path !== PROVIDER && readsTheRow(path))).toEqual([]);
  });

  it("never takes the account kind from BetterAuth's session", () => {
    expect(Object.keys(modules).filter((path) => /\bisAnonymous\b/.test(code(path)))).toEqual([]);
  });
});
