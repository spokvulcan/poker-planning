/**
 * useDeleteAccount — Delete account for a permanent account (spec §15.2,
 * ADR-0019): the user-deletion mutation first, then the session is signed
 * out the way the sign-out hook does, the register's line is shown and the
 * person lands on the homepage. A failed deletion signs nothing out and says
 * why: a refusal's own message, else a readable line, never the "Server
 * Error" production sends in place of a plain Error's message.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const spy = vi.hoisted(() => ({
  order: [] as string[],
  deleteFails: null as unknown,
  toasts: [] as { kind: string; message: string }[],
  push: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => async () => {
    if (spy.deleteFails) throw spy.deleteFails;
    spy.order.push("deleteUser");
  },
}));
vi.mock("@/hooks/useSignOut", () => ({
  useSignOut: () => async () => {
    spy.order.push("signOut");
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: spy.push }) }));
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (message: string) => spy.toasts.push({ kind: "success", message }),
    error: (message: string) => spy.toasts.push({ kind: "error", message }),
  },
}));

import { useDeleteAccount } from "./useDeleteAccount";
import { ACCOUNT_DELETED, DELETE_ACCOUNT_FAILED } from "@/convex/accountCopy";
import { refusal } from "@/convex/model/refusal";

beforeEach(() => {
  spy.order = [];
  spy.deleteFails = null;
  spy.toasts = [];
  spy.push.mockReset();
});

describe("useDeleteAccount", () => {
  it("deletes the account, then signs out, tells what stays, and goes home", async () => {
    const { result } = renderHook(() => useDeleteAccount());
    expect(await result.current()).toBe(true);
    expect(spy.order).toEqual(["deleteUser", "signOut"]);
    expect(spy.toasts).toEqual([{ kind: "success", message: ACCOUNT_DELETED }]);
    expect(spy.push).toHaveBeenCalledWith("/");
  });

  it("a refused deletion shows the refusal's message and signs nothing out", async () => {
    spy.deleteFails = refusal("forbidden", "Your account can't be deleted right now.");
    const { result } = renderHook(() => useDeleteAccount());
    expect(await result.current()).toBe(false);
    expect(spy.order).toEqual([]);
    expect(spy.toasts).toEqual([{ kind: "error", message: "Your account can't be deleted right now." }]);
    expect(spy.push).not.toHaveBeenCalled();
  });

  it("a deletion that fails on the server shows a readable line, not the redacted error", async () => {
    spy.deleteFails = new Error("[CONVEX M(users:deleteUser)] [Request ID: 2b9e4d1a] Server Error\n  Called by client");
    const { result } = renderHook(() => useDeleteAccount());
    expect(await result.current()).toBe(false);
    expect(spy.order).toEqual([]);
    expect(spy.toasts).toEqual([{ kind: "error", message: DELETE_ACCOUNT_FAILED }]);
    expect(spy.push).not.toHaveBeenCalled();
  });
});
