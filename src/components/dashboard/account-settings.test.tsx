/**
 * The Account tab's email toggle (spec §16.4): "Email me about retros and
 * action items", on unless the account opted out, writing the flag on
 * every flip. #299 adds Delete account beside it.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: undefined as undefined | null | { _id: string; emailOptOut?: boolean },
  setEmailOptOut: vi.fn(async () => null),
}));

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
