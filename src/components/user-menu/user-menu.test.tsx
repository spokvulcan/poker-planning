/**
 * UserMenu, the account menu in the navbar and the room header, draws the
 * viewer AuthProvider hands out: their name, avatar, email and whether they
 * have a permanent account. A guest signed in with no users row yet (as
 * after "Continue as guest") gets the menu like anyone signed in, as
 * "Guest" with Sign in, until their first room write gives them a row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { Viewer } from "@/components/auth/auth-provider";

const mocks = vi.hoisted(() => ({ viewer: { status: "loading" } as Viewer }));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    isLoading: mocks.viewer.status === "loading",
    isAuthenticated: mocks.viewer.status === "signedIn",
    viewer: mocks.viewer,
  }),
}));

// Outside a room, and no read answers: what the menu shows of the viewer is AuthProvider's.
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => {},
}));

vi.mock("next/navigation", () => ({ useParams: () => ({}) }));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- next/image's stand-in
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock("@/hooks/useSignOut", () => ({ useSignOut: () => async () => {} }));

// The menu's content, drawn in place whether it is open or not.
vi.mock("@/components/ui/dropdown-menu", async () => {
  const { cloneElement } = await import("react");
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Item = ({ children, render, ...props }: { children?: ReactNode; render?: ReactElement }) =>
    render ? cloneElement(render, props, children) : <button {...props}>{children}</button>;
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Item,
    DropdownMenuContent: Pass,
    DropdownMenuItem: Item,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuSub: Pass,
    DropdownMenuSubTrigger: Pass,
    DropdownMenuSubContent: Pass,
    DropdownMenuRadioGroup: Pass,
    DropdownMenuRadioItem: Pass,
    DropdownMenuGroup: Pass,
  };
});

import { UserMenu } from "./user-menu";

beforeEach(() => {
  mocks.viewer = { status: "loading" };
});

afterEach(cleanup);

describe("UserMenu", () => {
  it("is there for a guest signed in with no users row yet, as Guest, with Sign in", () => {
    mocks.viewer = { status: "signedIn", name: null, avatarUrl: null, email: null, isPermanent: false };
    render(<UserMenu />);

    expect(within(screen.getByTestId("user-menu-trigger")).getByText("Guest")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth/signin");
  });

  it("shows a permanent account's name, avatar and email, and no Sign in", () => {
    mocks.viewer = {
      status: "signedIn",
      name: "Ada Lovelace",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
      email: "ada@example.com",
      isPermanent: true,
    };
    render(<UserMenu />);

    const trigger = within(screen.getByTestId("user-menu-trigger"));
    expect(trigger.getByText("Ada Lovelace")).toBeTruthy();
    expect(trigger.getByRole("img", { name: "Ada Lovelace" }).getAttribute("src")).toBe(
      "https://lh3.googleusercontent.com/a/ada"
    );
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("offers Sign in to a guest whose row has a name", () => {
    mocks.viewer = { status: "signedIn", name: "Bob", avatarUrl: null, email: null, isPermanent: false };
    render(<UserMenu />);

    expect(within(screen.getByTestId("user-menu-trigger")).getByText("Bob")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("draws nothing while the viewer loads", () => {
    render(<UserMenu />);

    expect(screen.queryByTestId("user-menu-trigger")).toBeNull();
  });
});
