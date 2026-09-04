/**
 * `/retro/new` (spec §6.1): the format is pre-selected and collapsed to one
 * line, expandable to the six-format library with picker lines and prompts;
 * create sends the chosen format's name and the optional cards-due date.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  ensureSession: vi.fn(async () => "auth-1"),
  push: vi.fn(),
  auth: { isAuthenticated: true, isLoading: false },
}));

vi.mock("@/convex/_generated/api", () => ({ api: { retro: { create: "retro.create" } } }));
vi.mock("convex/react", () => ({ useMutation: () => mocks.create }));
vi.mock("@/hooks/useEnsureSession", () => ({ useEnsureSession: () => mocks.ensureSession }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/components/navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/footer", () => ({ Footer: () => null }));

import { CreateRetroContent } from "./create-content";
import { RETRO_FORMATS, DEFAULT_RETRO_FORMAT } from "@/convex/model/retroFormats";

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue("room1");
  mocks.push.mockReset();
});
afterEach(cleanup);

describe("CreateRetroContent", () => {
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
