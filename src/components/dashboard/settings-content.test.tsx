/**
 * Settings tabs: Account (the email toggle, spec §16.4) and Integrations;
 * `?tab=` picks one, Account is the first and the default.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.searchParams }));
vi.mock("./integrations-settings", () => ({ IntegrationsSettings: () => <div data-testid="integrations" /> }));
vi.mock("./account-settings", () => ({ AccountSettings: () => <div data-testid="account" /> }));

import { SettingsContent } from "./settings-content";

beforeEach(() => {
  mocks.searchParams = new URLSearchParams();
});
afterEach(cleanup);

describe("SettingsContent", () => {
  it("opens on Account and switches to Integrations", () => {
    render(<SettingsContent />);
    expect(screen.getByTestId("account")).toBeTruthy();
    expect(screen.queryByTestId("integrations")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Integrations" }));
    expect(screen.getByTestId("integrations")).toBeTruthy();
  });

  it("honours ?tab=integrations", () => {
    mocks.searchParams = new URLSearchParams("tab=integrations");
    render(<SettingsContent />);
    expect(screen.getByTestId("integrations")).toBeTruthy();
  });
});
