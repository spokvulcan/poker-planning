/**
 * `/retro/new` says a new retro is kept on your account only for a
 * permanent account: one whose users row says so. Anyone else, a guest whose
 * row has no kind or who has no row yet included, is told guest retros are
 * removed after five quiet days. The page runs under the real auth provider;
 * its sources are faked at their edges: Convex's auth state, the caller's
 * users row and BetterAuth's session.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const sources = vi.hoisted(() => ({
  // Convex's auth state
  isAuthenticated: true,
  // The caller's users row: null while they have none
  row: null as Record<string, unknown> | null,
  // BetterAuth's session
  session: null as { user: Record<string, unknown> } | null,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({ isLoading: false, isAuthenticated: sources.isAuthenticated }),
    useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) =>
      args !== "skip" && getFunctionName(query) === "users:getGlobalUser" ? sources.row : undefined,
    useMutation: () => async () => {},
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: sources.session, isPending: false }) },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// The page's chrome, with its own account menu.
vi.mock("@/components/navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/footer", () => ({ Footer: () => null }));

import { AuthProvider } from "@/components/auth/auth-provider";
import { CreateRetroContent } from "./create-content";

const KEPT = "Kept on your account until you delete it.";
const REMOVED = "Guest retros are removed after 5 quiet days.";

function retentionNote() {
  render(
    <AuthProvider>
      <CreateRetroContent />
    </AuthProvider>
  );
  return screen.getByTestId("retro-retention-note").textContent;
}

beforeEach(() => {
  sources.isAuthenticated = true;
  sources.row = null;
  sources.session = null;
});

afterEach(cleanup);

describe("CreateRetroContent's retention note", () => {
  it("tells a permanent account the retro is kept on it", () => {
    sources.row = { _id: "user-ada", authUserId: "auth-ada", name: "Ada", email: "ada@example.com", accountType: "permanent", createdAt: 0 };
    sources.session = { user: { id: "auth-ada", isAnonymous: false, email: "ada@example.com" } };

    expect(retentionNote()).toBe(KEPT);
  });

  it.each([
    [
      "a guest",
      { _id: "user-guest", authUserId: "auth-guest", name: "Guest 4829", accountType: "anonymous", createdAt: 0 },
      { user: { id: "auth-guest", isAnonymous: true } },
    ],
    [
      "a guest whose row has no kind, whatever BetterAuth's session says",
      { _id: "user-bob", authUserId: "auth-bob", name: "Bob", createdAt: 0 },
      { user: { id: "auth-bob", isAnonymous: false, email: "bob@example.com" } },
    ],
    ["someone signed in with no users row yet", null, { user: { id: "auth-new", isAnonymous: true } }],
  ])("says guest retros are removed to %s", (_, row, session) => {
    sources.row = row;
    sources.session = session;

    expect(retentionNote()).toContain(REMOVED);
  });

  it("says guest retros are removed to a visitor", () => {
    sources.isAuthenticated = false;

    expect(retentionNote()).toContain(REMOVED);
  });
});
