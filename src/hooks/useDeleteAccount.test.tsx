/**
 * useDeleteAccount — Delete account for a permanent account (spec §15.2,
 * ADR-0019): the user-deletion mutation first, then the session is signed
 * out the way the sign-out hook does, the register's line is shown and the
 * person lands on the homepage. A refused deletion (the last-admin rule)
 * surfaces the server's copy and signs nothing out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const spy = vi.hoisted(() => ({
  order: [] as string[],
  deleteFails: null as string | null,
  toasts: [] as { kind: string; message: string }[],
  push: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => async () => {
    if (spy.deleteFails) throw new Error(spy.deleteFails);
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
import { ACCOUNT_DELETED } from "@/convex/retroCopy";

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

  it("a refused deletion surfaces the server's copy and signs nothing out", async () => {
    spy.deleteFails = "Make someone else an admin first, or delete the team.";
    const { result } = renderHook(() => useDeleteAccount());
    expect(await result.current()).toBe(false);
    expect(spy.order).toEqual([]);
    expect(spy.toasts).toEqual([{ kind: "error", message: "Make someone else an admin first, or delete the team." }]);
    expect(spy.push).not.toHaveBeenCalled();
  });
});
