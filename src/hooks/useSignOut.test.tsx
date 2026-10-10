/**
 * useSignOut — the one sign-out, shared by the user menus. Pinned: the server
 * signs the caller out (users.signOut, which deletes a guest's account and
 * keeps a permanent one) before the auth session is cleared, whatever the
 * browser makes of the session; the session is left alone when the server's
 * sign-out fails; and every failure path surfaces the one shared toast copy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Hoisted recorder shared with the (hoisted) vi.mock factories below, so the
// server and session calls, in order, and every raised toast are observable.
const spy = vi.hoisted(() => ({
  auth: { isLoading: false, viewer: { status: "loading" } } as Record<string, unknown>,
  order: [] as string[],
  serverFails: false,
  signOutError: null as { message: string } | null,
  signOutThrows: false,
  toasts: [] as string[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (mutation: Parameters<typeof getFunctionName>[0]) => async () => {
      if (spy.serverFails) throw new Error("server sign-out failed");
      spy.order.push(getFunctionName(mutation));
    },
  };
});

// What the browser makes of the session, which signing out must not go by.
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => spy.auth,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: async () => {
      if (spy.signOutThrows) throw new Error("sign out failed");
      spy.order.push("session cleared");
      return { error: spy.signOutError };
    },
  },
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: (message: string) => {
      spy.toasts.push(message);
    },
  },
}));

import { useSignOut } from "./useSignOut";

beforeEach(() => {
  spy.auth = { isLoading: false, viewer: { status: "loading" } };
  spy.order = [];
  spy.serverFails = false;
  spy.signOutError = null;
  spy.signOutThrows = false;
  spy.toasts = [];
});

describe("useSignOut", () => {
  it.each([
    [
      "a guest's session",
      { isLoading: false, viewer: { status: "signedIn", name: "Guest 4829", avatarUrl: null, email: null, isPermanent: false } },
    ],
    [
      "a permanent account's session",
      { isLoading: false, viewer: { status: "signedIn", name: "Ada", avatarUrl: null, email: "ada@example.com", isPermanent: true } },
    ],
    ["a session still loading", { isLoading: true, viewer: { status: "loading" } }],
  ])("signs out on the server, then clears %s", async (_, auth) => {
    spy.auth = auth;
    const { result } = renderHook(() => useSignOut());

    await result.current();

    expect(spy.order).toEqual(["users:signOut", "session cleared"]);
    expect(spy.toasts).toEqual([]);
  });

  it("does not clear the session when the server's sign-out fails", async () => {
    spy.serverFails = true;
    const { result } = renderHook(() => useSignOut());

    await result.current();

    expect(spy.order).toEqual([]);
    expect(spy.toasts).toEqual(["Failed to sign out. Please try again."]);
  });

  it("toasts the server's message when the auth sign-out reports an error", async () => {
    spy.signOutError = { message: "Session expired" };
    const { result } = renderHook(() => useSignOut());

    await result.current();

    expect(spy.order).toEqual(["users:signOut", "session cleared"]);
    expect(spy.toasts).toEqual(["Session expired"]);
  });

  it("falls back to the generic copy when sign-out throws", async () => {
    spy.signOutThrows = true;
    const { result } = renderHook(() => useSignOut());

    await result.current();

    expect(spy.toasts).toEqual(["Failed to sign out. Please try again."]);
  });
});
