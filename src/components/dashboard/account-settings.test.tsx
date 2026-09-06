/**
 * The Account tab (spec §16.4, §15.2): the email toggle "Email me about
 * retros and action items", on unless the account opted out, writing the
 * flag on every flip; and Delete account for a permanent account only,
 * behind a confirmation carrying the register's line, which stays open
 * when the deletion is refused.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  user: undefined as undefined | null | { _id: string; emailOptOut?: boolean },
  setEmailOptOut: vi.fn(async () => null),
  accountType: "permanent" as "permanent" | "anonymous" | null,
  deleteAccount: vi.fn(async () => true),
}));

vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ accountType: mocks.accountType }) }));
vi.mock("@/hooks/useDeleteAccount", () => ({ useDeleteAccount: () => mocks.deleteAccount }));
vi.mock("@/components/ui/alert-dialog", () => {
  const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
      open ? <div role="alertdialog">{children}</div> : null,
    AlertDialogContent: pass,
    AlertDialogHeader: pass,
    AlertDialogFooter: pass,
    AlertDialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    AlertDialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    AlertDialogCancel: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => (
      <button disabled={disabled}>{children}</button>
    ),
    AlertDialogAction: ({ children, onClick, disabled }: { children?: ReactNode; onClick?: () => void; disabled?: boolean }) => (
      <button onClick={onClick} disabled={disabled}>{children}</button>
    ),
  };
});

vi.mock("@/convex/_generated/api", () => ({
  api: { users: { getGlobalUser: "users.getGlobalUser", setEmailOptOut: "users.setEmailOptOut" } },
}));
vi.mock("convex/react", () => ({
  useQuery: () => mocks.user,
  useMutation: () => mocks.setEmailOptOut,
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AccountSettings } from "./account-settings";

beforeEach(() => {
  mocks.user = { _id: "u1" };
  mocks.setEmailOptOut.mockClear();
  mocks.accountType = "permanent";
  mocks.deleteAccount.mockReset();
  mocks.deleteAccount.mockResolvedValue(true);
});
afterEach(cleanup);

describe("AccountSettings", () => {
  it("shows the toggle on for an account that never opted out, and writes optOut: true on a flip", async () => {
    render(<AccountSettings />);
    const toggle = screen.getByRole("switch", { name: "Email me about retros and action items" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.setEmailOptOut).toHaveBeenCalledWith({ optOut: true }));
  });

  it("shows the toggle off for an opted-out account, and writes optOut: false on a flip", async () => {
    mocks.user = { _id: "u1", emailOptOut: true };
    render(<AccountSettings />);
    const toggle = screen.getByRole("switch", { name: "Email me about retros and action items" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.setEmailOptOut).toHaveBeenCalledWith({ optOut: false }));
  });

  it("renders nothing interactive while the account is loading", () => {
    mocks.user = undefined;
    render(<AccountSettings />);
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("AccountSettings — Delete account (spec §15.2)", () => {
  it("a permanent account confirms with the register's line and deletes", async () => {
    render(<AccountSettings />);
    fireEvent.click(within(screen.getByTestId("delete-account")).getByRole("button", { name: "Delete account" }));
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText("Delete your account?")).toBeTruthy();
    expect(
      dialog.getByText(
        "Your account is removed. Cards and action items you wrote in team retros stay with those teams, without your name."
      )
    ).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("a refused deletion keeps the confirmation open for another try", async () => {
    mocks.deleteAccount.mockResolvedValue(false);
    render(<AccountSettings />);
    fireEvent.click(within(screen.getByTestId("delete-account")).getByRole("button", { name: "Delete account" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("an anonymous account has no Delete account: signing out already deletes it", () => {
    mocks.accountType = "anonymous";
    render(<AccountSettings />);
    expect(screen.queryByTestId("delete-account")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
  });
});
