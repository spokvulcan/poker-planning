/**
 * NewTeamDialog — "New team" (spec §5): a permanent account names the team,
 * the mutation runs and the router lands on the new team page; an anonymous
 * account sees "Sign in to create a team" with a sign-in link back to where
 * it came from, and never reaches the mutation.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  accountType: null as null | "anonymous" | "permanent",
  create: vi.fn<(args: { name: string }) => Promise<string>>(),
  push: vi.fn(),
}));

vi.mock("convex/react", () => ({ useMutation: () => mocks.create }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ accountType: mocks.accountType }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: () => {} } }));
// The Base UI dialog needs a portal and pointer environment jsdom lacks;
// the dialog's structure is not under test, its content is.
vi.mock("@/components/ui/dialog", () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) => (open ? <div>{children}</div> : null),
    DialogContent: passthrough,
    DialogDescription: passthrough,
    DialogFooter: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough,
  };
});

import { NewTeamDialog } from "./new-team-dialog";

beforeEach(() => {
  mocks.accountType = "permanent";
  mocks.create.mockReset();
  mocks.push.mockReset();
});
afterEach(cleanup);

describe("NewTeamDialog", () => {
  it("a permanent account names the team, the mutation runs and the router lands on it", async () => {
    mocks.create.mockResolvedValue("team-9");
    const onOpenChange = vi.fn();
    render(<NewTeamDialog open onOpenChange={onOpenChange} returnTo="/dashboard/retros" />);

    const submit = screen.getByRole("button", { name: "Create team" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Team name" }), { target: { value: "  Acme  " } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/team/team-9"));
    expect(mocks.create).toHaveBeenCalledWith({ name: "Acme" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("an anonymous account is told to sign in and sent back here afterwards", () => {
    mocks.accountType = "anonymous";
    render(<NewTeamDialog open onOpenChange={() => {}} returnTo="/dashboard/retros" />);

    expect(screen.getByText("Sign in to create a team")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/auth/signin?from=%2Fdashboard%2Fretros"
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
