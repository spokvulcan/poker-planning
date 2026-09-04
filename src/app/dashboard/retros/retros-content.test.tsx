/**
 * RetrosContent — /dashboard/retros (spec §18.1): the person's Teams with
 * New team. Loading shows a skeleton, no teams shows the empty state with
 * the same CTA, and each team links to its page with its role.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  teams: undefined as undefined | { _id: string; name: string; role: "admin" | "member" }[],
  dialogOpen: [] as boolean[],
}));

vi.mock("convex/react", () => ({ useQuery: () => mocks.teams }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/dashboard", () => ({
  DashboardHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/team/new-team-dialog", () => ({
  NewTeamDialog: ({ open }: { open: boolean }) => {
    mocks.dialogOpen.push(open);
    return open ? <div role="dialog">New team dialog</div> : null;
  },
}));

import { RetrosContent } from "./retros-content";

beforeEach(() => {
  mocks.teams = undefined;
  mocks.dialogOpen = [];
});
afterEach(cleanup);

describe("RetrosContent", () => {
  it("shows a skeleton while the teams load", () => {
    render(<RetrosContent />);
    expect(screen.getByRole("heading", { name: "Retros" })).toBeTruthy();
    expect(screen.queryByTestId("team-list")).toBeNull();
    expect(screen.queryByText("No teams yet")).toBeNull();
  });

  it("with no teams, shows the empty state and New team opens the dialog", () => {
    mocks.teams = [];
    render(<RetrosContent />);
    expect(screen.getByText("No teams yet")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "New team" })[0]);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("lists each team as a link to its page with its role", () => {
    mocks.teams = [
      { _id: "t1", name: "Acme", role: "admin" },
      { _id: "t2", name: "Beta", role: "member" },
    ];
    render(<RetrosContent />);
    const acme = screen.getByRole("link", { name: /Acme/ });
    expect(acme.getAttribute("href")).toBe("/team/t1");
    expect(acme.textContent).toContain("admin");
    expect(screen.getByRole("link", { name: /Beta/ }).getAttribute("href")).toBe("/team/t2");
    expect(screen.getByRole("link", { name: /Beta/ }).textContent).toContain("member");
  });
});
