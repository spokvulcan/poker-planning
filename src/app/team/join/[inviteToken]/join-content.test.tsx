/**
 * JoinTeamContent — the invite route's four states (spec §5): a stale link,
 * an anonymous account shown "Sign in to join {team}" with a return path, a
 * permanent account joined once and sent to the team page, and a failed join
 * that "Try again" really retries. Convex, auth, routing and chrome mocked.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  team: undefined as undefined | null | { _id: string; name: string },
  auth: { isAuthenticated: false, isLoading: false, accountType: null as null | "anonymous" | "permanent" },
  joinByInvite: vi.fn<(args: { inviteToken: string }) => Promise<string>>(),
  replace: vi.fn(),
  // One router object, as Next's useRouter gives — it is an effect dependency.
  router: { replace: (href: string) => mocks.replace(href), push: vi.fn() },
}));

vi.mock("convex/react", () => ({
  useQuery: () => mocks.team,
  useMutation: () => mocks.joinByInvite,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ inviteToken: "tok-1" }),
  useRouter: () => mocks.router,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/components/navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/footer", () => ({ Footer: () => null }));

import { JoinTeamContent } from "./join-content";

beforeEach(() => {
  mocks.team = { _id: "team-1", name: "Acme" };
  mocks.auth = { isAuthenticated: false, isLoading: false, accountType: null };
  mocks.joinByInvite.mockReset();
  mocks.replace.mockReset();
});
afterEach(cleanup);

describe("JoinTeamContent", () => {
  it("a stale link says so and offers the way back", () => {
    mocks.team = null;
    render(<JoinTeamContent />);
    expect(screen.getByText(/no longer valid/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Retros" }).getAttribute("href")).toBe("/dashboard/retros");
    expect(mocks.joinByInvite).not.toHaveBeenCalled();
  });

  it("an anonymous account is shown Sign in to join {team}, returning here after linking", () => {
    mocks.auth = { isAuthenticated: true, isLoading: false, accountType: "anonymous" };
    render(<JoinTeamContent />);
    const link = screen.getByRole("link", { name: "Sign in to join Acme" });
    expect(link.getAttribute("href")).toBe(`/auth/signin?from=${encodeURIComponent("/team/join/tok-1")}`);
    expect(mocks.joinByInvite).not.toHaveBeenCalled();
  });

  it("nobody signed in gets the same sign-in copy", () => {
    render(<JoinTeamContent />);
    expect(screen.getByRole("link", { name: "Sign in to join Acme" })).toBeTruthy();
  });

  it("a permanent account joins exactly once and lands on the team page", async () => {
    mocks.auth = { isAuthenticated: true, isLoading: false, accountType: "permanent" };
    mocks.joinByInvite.mockResolvedValue("team-1");
    const { rerender } = render(<JoinTeamContent />);
    rerender(<JoinTeamContent />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/team/team-1"));
    expect(mocks.joinByInvite).toHaveBeenCalledTimes(1);
    expect(mocks.joinByInvite).toHaveBeenCalledWith({ inviteToken: "tok-1" });
  });

  it("a failed join shows the server's copy, and Try again really retries", async () => {
    mocks.auth = { isAuthenticated: true, isLoading: false, accountType: "permanent" };
    mocks.joinByInvite.mockRejectedValueOnce(new Error("This invite link is no longer valid"));
    mocks.joinByInvite.mockResolvedValueOnce("team-1");
    render(<JoinTeamContent />);

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByText("This invite link is no longer valid")).toBeTruthy();
    fireEvent.click(retry);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/team/team-1"));
    expect(mocks.joinByInvite).toHaveBeenCalledTimes(2);
  });
});
