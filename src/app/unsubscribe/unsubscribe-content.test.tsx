/**
 * `/unsubscribe?token=…` (spec §16.4): calls the guardless mutation once
 * with the token, signed in or not, and shows the one line with a link to
 * Settings whatever the token did. Without a token it calls nothing and
 * still shows the line.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  unsubscribe: vi.fn(async () => true),
  searchParams: new URLSearchParams(),
}));

vi.mock("@/convex/_generated/api", () => ({ api: { email: { unsubscribe: "email.unsubscribe" } } }));
vi.mock("convex/react", () => ({ useMutation: () => mocks.unsubscribe }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.searchParams }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/footer", () => ({ Footer: () => null }));

import { UnsubscribeContent } from "./unsubscribe-content";

beforeEach(() => {
  mocks.unsubscribe.mockClear().mockResolvedValue(true);
  mocks.searchParams = new URLSearchParams("token=u1.abc");
});
afterEach(cleanup);

describe("UnsubscribeContent", () => {
  it("calls the mutation once with the token and shows the line with the Settings link", async () => {
    render(<UnsubscribeContent />);
    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalledWith({ token: "u1.abc" }));
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("unsubscribed").textContent).toBe(
      "You won't get retro or action emails. Turn them back on in Settings."
    );
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/dashboard/settings?tab=account");
  });

  it("shows the same line when the token flipped nothing", async () => {
    mocks.unsubscribe.mockResolvedValue(false);
    render(<UnsubscribeContent />);
    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("unsubscribed").textContent).toMatch(/You won't get retro or action emails/);
  });

  it("a request that fails outright says so, and still links to Settings", async () => {
    mocks.unsubscribe.mockRejectedValue(new Error("boom"));
    render(<UnsubscribeContent />);
    await waitFor(() => expect(screen.getByTestId("unsubscribed").getAttribute("data-failed")).toBe("true"));
    expect(screen.getByTestId("unsubscribed").textContent).toBe(
      "That link did not go through. You can turn these emails off in Settings."
    );
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/dashboard/settings?tab=account");
  });

  it("without a token calls nothing and still shows the line", async () => {
    mocks.searchParams = new URLSearchParams();
    render(<UnsubscribeContent />);
    expect(screen.getByTestId("unsubscribed").textContent).toMatch(/You won't get retro or action emails/);
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });
});
