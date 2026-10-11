/**
 * Every dashboard page is an account's own: the server turns a visitor away,
 * and the layout sends one who becomes a visitor on a page (signing out, here
 * or in another tab) to sign in, coming back to it. Before, only the Overview
 * did, and the other pages were left on their skeletons.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Viewer } from "@/components/auth/viewer";

const mocks = vi.hoisted(() => ({
  viewer: { status: "loading" } as Viewer,
  replaced: [] as string[],
}));

vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ viewer: mocks.viewer }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/retros",
  useRouter: () => ({ replace: (href: string) => mocks.replaced.push(href) }),
}));
vi.mock("./app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { DashboardLayout } from "./dashboard-layout";

beforeEach(() => {
  mocks.replaced = [];
});

afterEach(cleanup);

describe("DashboardLayout", () => {
  it("sends a visitor to sign in, back to the page they were on", () => {
    mocks.viewer = { status: "visitor" };
    render(<DashboardLayout>A page</DashboardLayout>);

    expect(mocks.replaced).toEqual(["/auth/signin?from=%2Fdashboard%2Fretros"]);
  });

  it.each<[string, Viewer]>([
    ["a viewer still loading", { status: "loading" }],
    ["a signed-in viewer", { status: "signedIn", name: "Ada", avatarUrl: null, email: null, isPermanent: true, confirmed: true }],
  ])("leaves %s on the page", (_, viewer) => {
    mocks.viewer = viewer;
    render(<DashboardLayout>A page</DashboardLayout>);

    expect(mocks.replaced).toEqual([]);
  });
});
