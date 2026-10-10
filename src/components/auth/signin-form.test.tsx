/**
 * The sign-in page's guest button goes by the viewer AuthProvider hands out:
 * someone already signed in without a permanent account, a guest with no
 * users row yet included, is offered the way back to where they came from;
 * a visitor is offered to continue as a guest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Viewer } from "@/components/auth/auth-provider";

const mocks = vi.hoisted(() => ({ viewer: { status: "loading" } as Viewer }));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    isLoading: mocks.viewer.status === "loading",
    isAuthenticated: mocks.viewer.status === "signedIn",
    viewer: mocks.viewer,
  }),
}));

vi.mock("@/hooks/useEnsureSession", () => ({ useEnsureSession: () => async () => {} }));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { social: async () => ({}), magicLink: async () => ({}) } },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams("from=/room/room-1"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { SigninForm } from "./signin-form";

beforeEach(() => {
  mocks.viewer = { status: "loading" };
});

afterEach(cleanup);

describe("SigninForm's guest button", () => {
  it("takes a guest signed in with no users row yet back", () => {
    mocks.viewer = { status: "signedIn", name: null, avatarUrl: null, email: null, isPermanent: false };
    render(<SigninForm />);

    expect(screen.getByRole("button", { name: "Cancel and return to room" })).toBeTruthy();
  });

  it("lets a visitor continue as a guest", () => {
    mocks.viewer = { status: "visitor" };
    render(<SigninForm />);

    expect(screen.getByRole("button", { name: "Continue as guest" })).toBeTruthy();
  });
});
