/**
 * NavUser, the dashboard sidebar's account menu, draws the viewer AuthProvider
 * hands out: their name, avatar, email and whether they have a permanent
 * account. A guest signed in with no users row yet gets the menu, as "Guest"
 * with Sign in, rather than a skeleton that never resolves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

// No read answers: what the menu shows of the viewer is AuthProvider's.
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => {},
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- next/image's stand-in
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock("@/hooks/useSignOut", () => ({ useSignOut: () => async () => {} }));

// The sidebar's desktop branch: jsdom has no matchMedia.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

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

import { SidebarProvider } from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";

function renderNavUser() {
  return render(
    <SidebarProvider>
      <NavUser />
    </SidebarProvider>
  );
}

beforeEach(() => {
  mocks.viewer = { status: "loading" };
});

afterEach(cleanup);

describe("NavUser", () => {
  it("is there for a guest signed in with no users row yet, as Guest, with Sign in", () => {
    mocks.viewer = { status: "signedIn", name: null, avatarUrl: null, email: null, isPermanent: false };
    renderNavUser();

    expect(screen.getAllByText("Guest").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth/signin?from=/dashboard");
  });

  it("shows a permanent account's name, avatar and email, and no Sign in", () => {
    mocks.viewer = {
      status: "signedIn",
      name: "Ada Lovelace",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
      email: "ada@example.com",
      isPermanent: true,
    };
    renderNavUser();

    expect(screen.getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img", { name: "Ada Lovelace" })[0].getAttribute("src")).toBe(
      "https://lh3.googleusercontent.com/a/ada"
    );
    expect(screen.getAllByText("ada@example.com").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("is a skeleton while the viewer loads", () => {
    renderNavUser();

    expect(screen.queryByText("Guest")).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
