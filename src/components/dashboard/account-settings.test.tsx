/**
 * The Account tab: Delete account for a permanent account only, behind a
 * confirmation carrying the register's line, which stays open when the
 * deletion fails; a guest gets a line about signing out instead.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
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


import { AccountSettings } from "./account-settings";

beforeEach(() => {
  mocks.accountType = "permanent";
  mocks.deleteAccount.mockReset();
  mocks.deleteAccount.mockResolvedValue(true);
});
afterEach(cleanup);

describe("AccountSettings — Delete account", () => {
  it("a permanent account confirms with the register's line and deletes", async () => {
    render(<AccountSettings />);
    fireEvent.click(within(screen.getByTestId("delete-account")).getByRole("button", { name: "Delete account" }));
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText("Delete your account?")).toBeTruthy();
    expect(
      dialog.getByText(
        "Your account is removed. Stickies and action items you wrote stay in their retros, without your name."
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
    expect(screen.getByTestId("guest-account")).toBeTruthy();
    expect(screen.queryByTestId("delete-account")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
  });
});
