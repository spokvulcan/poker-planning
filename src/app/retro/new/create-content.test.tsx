/**
 * `/retro/new` (spec §6.1): the team picker lists the person's Teams with
 * New team and is hidden for an anonymous account; `?team=` pre-selects;
 * the format is pre-selected — the Team's last format, listed first in the
 * library — and collapsed to one line; the disclosure reads the team or
 * teamless line before the retro exists; create sends the Team, the format
 * name and the optional cards-due date.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  ensureSession: vi.fn(async () => "auth-1"),
  push: vi.fn(),
  auth: { isAuthenticated: true, isLoading: false, accountType: "anonymous" as "anonymous" | "permanent" | null },
  searchParams: new URLSearchParams(),
  queries: {} as Record<string, unknown>,
  dialog: { open: false, onCreated: undefined as undefined | ((team: { _id: string; name: string }) => void) },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    retro: { create: "retro.create", lastFormat: "retro.lastFormat" },
    teams: { listMine: "teams.listMine" },
  },
}));
vi.mock("convex/react", () => ({
  useMutation: () => mocks.create,
  useQuery: (ref: string, args: unknown) => (args === "skip" ? undefined : mocks.queries[ref]),
}));
vi.mock("@/hooks/useEnsureSession", () => ({ useEnsureSession: () => mocks.ensureSession }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/components/navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/footer", () => ({ Footer: () => null }));
vi.mock("@/components/team/new-team-dialog", () => ({
  NewTeamDialog: ({ open, onCreated }: { open: boolean; onCreated?: (team: { _id: string; name: string }) => void }) => {
    mocks.dialog = { open, onCreated };
    return open ? <div role="dialog">New team dialog</div> : null;
  },
}));

import { CreateRetroContent } from "./create-content";
import { RETRO_FORMATS, DEFAULT_RETRO_FORMAT } from "@/convex/model/retroFormats";
import { TEAMLESS_DISCLOSURE, keptByTeam } from "@/convex/retroCopy";

const teams = [
  { _id: "team-1", name: "Acme Squad", role: "member" },
  { _id: "team-2", name: "Beta", role: "admin" },
];

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue("room1");
  mocks.push.mockReset();
  mocks.auth.accountType = "anonymous";
  mocks.searchParams = new URLSearchParams();
  mocks.queries = { "teams.listMine": teams, "retro.lastFormat": null };
  mocks.dialog = { open: false, onCreated: undefined };
});
afterEach(cleanup);

describe("CreateRetroContent — format", () => {
  it("pre-selects the default format, collapsed to one line", () => {
    render(<CreateRetroContent />);
    expect(screen.getByTestId("format-selected").textContent).toContain(DEFAULT_RETRO_FORMAT.name);
    expect(screen.queryByTestId("format-library")).toBeNull();
  });

  it("expands to the six formats with their picker lines and prompts, and picks one", () => {
    render(<CreateRetroContent />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    const library = screen.getByTestId("format-library");
    expect(library).toBeTruthy();
    for (const format of RETRO_FORMATS) {
      expect(screen.getByText(format.description)).toBeTruthy();
      for (const prompt of format.prompts) {
        expect(screen.getAllByText(prompt.label).length).toBeGreaterThan(0);
      }
    }
    fireEvent.click(screen.getByLabelText("Lean Coffee"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByTestId("format-selected").textContent).toContain("Lean Coffee");
  });

  it("creates with the name, the format name and the cards-due date, then opens the board", async () => {
    render(<CreateRetroContent />);
    fireEvent.change(screen.getByLabelText("Retro name"), { target: { value: "Sprint 12" } });
    fireEvent.change(screen.getByLabelText("Cards due"), { target: { value: "2026-09-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Start retro" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const args = mocks.create.mock.calls[0][0];
    expect(args.name).toBe("Sprint 12");
    expect(args.formatName).toBe(DEFAULT_RETRO_FORMAT.name);
    expect(new Date(args.collectUntil).toISOString().slice(0, 10)).toBe("2026-09-10");
    expect("teamId" in args).toBe(false);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/room/room1"));
  });

  it("omits collectUntil when the date is left blank", async () => {
    render(<CreateRetroContent />);
    fireEvent.click(screen.getByRole("button", { name: "Start retro" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect("collectUntil" in mocks.create.mock.calls[0][0]).toBe(false);
    expect(mocks.create.mock.calls[0][0].name).toMatch(/^Retro /);
  });
});

describe("CreateRetroContent — team", () => {
  it("hides the team picker entirely for an anonymous account and reads the teamless line", () => {
    render(<CreateRetroContent />);
    expect(screen.queryByLabelText("Team")).toBeNull();
    expect(screen.getByTestId("disclosure").textContent).toBe(TEAMLESS_DISCLOSURE);
  });

  it("lists the person's Teams with No team and New team for a permanent account", () => {
    mocks.auth.accountType = "permanent";
    render(<CreateRetroContent />);
    const picker = screen.getByLabelText("Team") as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.textContent)).toEqual([
      "No team", "Acme Squad", "Beta", "New team…",
    ]);
    expect(picker.value).toBe("");
    expect(screen.getByTestId("disclosure").textContent).toBe(TEAMLESS_DISCLOSURE);
  });

  it("choosing a Team switches the disclosure to the team line and sends teamId", async () => {
    mocks.auth.accountType = "permanent";
    render(<CreateRetroContent />);
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "team-1" } });
    expect(screen.getByTestId("disclosure").textContent).toBe(keptByTeam("Acme Squad"));
    expect(screen.getByTestId("disclosure").getAttribute("data-kept")).toBe("team");

    fireEvent.click(screen.getByRole("button", { name: "Start retro" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0].teamId).toBe("team-1");
  });

  it("?team= pre-selects the Team; an id that is not one of the person's Teams is ignored", () => {
    mocks.auth.accountType = "permanent";
    mocks.searchParams = new URLSearchParams("team=team-2");
    render(<CreateRetroContent />);
    expect((screen.getByLabelText("Team") as HTMLSelectElement).value).toBe("team-2");
    expect(screen.getByTestId("disclosure").textContent).toBe(keptByTeam("Beta"));
    cleanup();

    mocks.searchParams = new URLSearchParams("team=team-9");
    render(<CreateRetroContent />);
    expect((screen.getByLabelText("Team") as HTMLSelectElement).value).toBe("");
    expect(screen.getByTestId("disclosure").textContent).toBe(TEAMLESS_DISCLOSURE);
  });

  it("holds the button while a URL-named Team is still loading", () => {
    mocks.auth.accountType = "permanent";
    mocks.searchParams = new URLSearchParams("team=team-2");
    mocks.queries["teams.listMine"] = undefined;
    render(<CreateRetroContent />);
    expect((screen.getByRole("button", { name: "Start retro" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("pre-selects the Team's last format and lists it first in the library, until the person picks", () => {
    mocks.auth.accountType = "permanent";
    mocks.searchParams = new URLSearchParams("team=team-1");
    mocks.queries["retro.lastFormat"] = { name: "Sailboat", prompts: [] };
    render(<CreateRetroContent />);
    expect(screen.getByTestId("format-selected").textContent).toContain("Sailboat");

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    const radios = within(screen.getByTestId("format-library")).getAllByRole("radio");
    expect(radios[0].getAttribute("aria-label")).toBe("Sailboat");
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
    expect(radios).toHaveLength(RETRO_FORMATS.length);

    fireEvent.click(screen.getByLabelText("4Ls"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByTestId("format-selected").textContent).toContain("4Ls");
  });

  it("falls back to the default when the last format's name is not in the library", () => {
    mocks.auth.accountType = "permanent";
    mocks.searchParams = new URLSearchParams("team=team-1");
    mocks.queries["retro.lastFormat"] = { name: "Our own", prompts: [] };
    render(<CreateRetroContent />);
    expect(screen.getByTestId("format-selected").textContent).toContain(DEFAULT_RETRO_FORMAT.name);
  });

  it("New team opens the dialog and selects the Team it creates before the Teams read catches up", async () => {
    mocks.auth.accountType = "permanent";
    render(<CreateRetroContent />);
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "__new" } });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText("Team") as HTMLSelectElement).value).toBe("");

    // The Teams read still lists the old Teams; the created one is known locally.
    act(() => mocks.dialog.onCreated?.({ _id: "team-3", name: "Gamma" }));
    expect(screen.getByTestId("disclosure").textContent).toBe(keptByTeam("Gamma"));
    fireEvent.click(screen.getByRole("button", { name: "Start retro" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0].teamId).toBe("team-3");
  });

  it("holds the button while the chosen Team's last format is still loading", () => {
    mocks.auth.accountType = "permanent";
    mocks.searchParams = new URLSearchParams("team=team-1");
    mocks.queries["retro.lastFormat"] = undefined;
    render(<CreateRetroContent />);
    expect((screen.getByRole("button", { name: "Start retro" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
