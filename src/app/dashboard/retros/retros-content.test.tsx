/**
 * RetrosContent — /dashboard/retros (spec §18.1): the retros the person
 * attended, grouped as the listing query returns them (by Team, teamless
 * under "No team"), each group heading a door to its team page; then the
 * person's Teams with New team. Loading shows skeletons, no teams shows the
 * empty state with the same CTA, and each team links to its page with its
 * role.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { ReactNode } from "react";

type Group = { teamId?: string; teamName: string; retros: { roomId: string; name: string }[] };

const mocks = vi.hoisted(() => ({
  teams: undefined as undefined | { _id: string; name: string; role: "admin" | "member" }[],
  groups: undefined as undefined | Group[],
  dialogOpen: [] as boolean[],
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { retro: { listMine: "retro.listMine" }, teams: { listMine: "teams.listMine" } },
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: string) => (ref === "retro.listMine" ? mocks.groups : mocks.teams),
}));
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
vi.mock("@/components/retro/retro-list", () => ({
  RetroRows: ({ rows }: { rows: { roomId: string; name: string }[] }) => (
    <ul data-testid="retro-rows">
      {rows.map((row) => (
        <li key={row.roomId}>{row.name}</li>
      ))}
    </ul>
  ),
}));

import { RetrosContent } from "./retros-content";

beforeEach(() => {
  mocks.teams = undefined;
  mocks.groups = undefined;
  mocks.dialogOpen = [];
});
afterEach(cleanup);

describe("RetrosContent — attended retros", () => {
  it("renders the groups in the query's order, team headings linking to the team page", () => {
    mocks.groups = [
      { teamId: "t1", teamName: "Acme", retros: [{ roomId: "r1", name: "Collecting" }, { roomId: "r2", name: "Older" }] },
      { teamName: "No team", retros: [{ roomId: "r3", name: "Loose" }] },
    ];
    mocks.teams = [];
    render(<RetrosContent />);
    const groups = screen.getAllByTestId("retro-group");
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByRole("link", { name: "Acme" }).getAttribute("href")).toBe("/team/t1");
    expect(within(groups[0]).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Collecting", "Older"]);
    expect(within(groups[1]).getByRole("heading", { name: "No team" })).toBeTruthy();
    expect(within(groups[1]).queryByRole("link")).toBeNull();
    expect(within(groups[1]).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Loose"]);
    expect(screen.getByRole("link", { name: /New retro/ }).getAttribute("href")).toBe("/retro/new");
  });

  it("shows the empty line when nothing was attended", () => {
    mocks.groups = [];
    mocks.teams = [];
    render(<RetrosContent />);
    expect(screen.getByText("Retros you take part in show up here.")).toBeTruthy();
    expect(screen.queryByTestId("retro-group")).toBeNull();
  });
});

describe("RetrosContent — teams", () => {
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
