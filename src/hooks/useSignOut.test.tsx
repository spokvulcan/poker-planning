/**
 * useSignOut — the one sign-out policy shared by the user menus. Pinned:
 * anonymous accounts are deleted before the auth session is cleared (and the
 * session is left alone when that delete fails), permanent accounts are kept,
 * and every failure path surfaces the one shared toast copy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Hoisted recorder shared with the (hoisted) vi.mock factories below, so the
// delete/signOut order and every raised toast are observable.
const spy = vi.hoisted(() => ({
  isAnonymous: false,
  order: [] as string[],
  deleteFails: false,
  signOutError: null as { message: string } | null,
  signOutThrows: false,
  toasts: [] as string[],
}));

vi.mock("convex/react", () => ({
  useMutation: () => async () => {
    if (spy.deleteFails) throw new Error("delete failed");
    spy.order.push("deleteUser");
  },
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ isAnonymous: spy.isAnonymous }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: async () => {
      if (spy.signOutThrows) throw new Error("sign out failed");
      spy.order.push("signOut");
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
  spy.isAnonymous = false;
  spy.order = [];
  spy.deleteFails = false;
  spy.signOutError = null;
  spy.signOutThrows = false;
  spy.toasts = [];
});

describe("useSignOut", () => {
  it("deletes an anonymous account before clearing the session", async () => {
    spy.isAnonymous = true;
    const { result } = renderHook(() => useSignOut());

    await result.current();

    expect(spy.order).toEqual(["deleteUser", "signOut"]);
    expect(spy.toasts).toEqual([]);
  });

  it("keeps a permanent account's data and only clears the session", async () => {
    const { result } = renderHook(() => useSignOut());

    await result.current();

    expect(spy.order).toEqual(["signOut"]);
    expect(spy.toasts).toEqual([]);
  });

  it("does not clear the session when the anonymous delete fails", async () => {
    spy.isAnonymous = true;
    spy.deleteFails = true;
    const { result } = renderHook(() => useSignOut());

    await result.current();

    expect(spy.order).toEqual([]);
    expect(spy.toasts).toEqual(["Failed to sign out. Please try again."]);
  });

  it("toasts the server's message when the auth sign-out reports an error", async () => {
    spy.signOutError = { message: "Session expired" };
    const { result } = renderHook(() => useSignOut());

    await result.current();

    expect(spy.order).toEqual(["signOut"]);
    expect(spy.toasts).toEqual(["Session expired"]);
  });

  it("falls back to the generic copy when sign-out throws", async () => {
    spy.signOutThrows = true;
    const { result } = renderHook(() => useSignOut());

    await result.current();

    expect(spy.toasts).toEqual(["Failed to sign out. Please try again."]);
  });
});
