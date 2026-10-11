/**
 * The sign-in page's guest button goes by the viewer AuthProvider hands out:
 * someone already signed in without a permanent account, a guest with no
 * users row yet included, is offered the way back to where they came from;
 * a visitor is offered to continue as a guest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Viewer } from "@/components/auth/auth-provider";

const mocks = vi.hoisted(() => ({
  viewer: { status: "loading" } as Viewer,
  from: "/room/room-1",
  pushed: [] as string[],
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    viewer: mocks.viewer,
  }),
}));

vi.mock("@/hooks/useEnsureSession", () => ({ useEnsureSession: () => async () => {} }));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { social: async () => ({}), magicLink: async () => ({}) } },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => mocks.pushed.push(href) }),
  useSearchParams: () => new URLSearchParams({ from: mocks.from }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { SigninForm } from "./signin-form";

beforeEach(() => {
  mocks.viewer = { status: "loading" };
  mocks.from = "/room/room-1";
  mocks.pushed = [];
});

afterEach(cleanup);

describe("SigninForm's guest button", () => {
  it("takes a guest signed in with no users row yet back", () => {
    mocks.viewer = { status: "signedIn", name: null, avatarUrl: null, email: null, isPermanent: false, confirmed: true };
    render(<SigninForm />);

    expect(screen.getByRole("button", { name: "Cancel and return to room" })).toBeTruthy();
  });

  it("lets a visitor continue as a guest", () => {
    mocks.viewer = { status: "visitor" };
    render(<SigninForm />);

    expect(screen.getByRole("button", { name: "Continue as guest" })).toBeTruthy();
  });
});

describe("SigninForm's way back", () => {
  async function continueAsGuest() {
    mocks.viewer = { status: "visitor" };
    render(<SigninForm />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));
    });
    return mocks.pushed;
  }

  it("goes back to the page on this site it came from", async () => {
    expect(await continueAsGuest()).toEqual(["/room/room-1"]);
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example/room"])(
    "comes home instead of going to another site from %s",
    async (from) => {
      mocks.from = from;

      expect(await continueAsGuest()).toEqual(["/"]);
    }
  );
});
