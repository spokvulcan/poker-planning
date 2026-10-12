/**
 * `/retro/new` says a new retro is kept on your account only for a
 * permanent account, as Convex answers from the session's token
 * (users.getViewer). Anyone else, a guest who has no users row yet included,
 * is told guest retros are removed after five quiet days. The page runs
 * under the real auth provider; its sources are faked at their edges:
 * Convex's auth state, its answer and BetterAuth's session.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const sources = vi.hoisted(() => ({
  // Convex's auth state
  isAuthenticated: true,
  // Convex's answer about who is signed in
  answer: null as Record<string, unknown> | null,
  // BetterAuth's session
  session: null as { user: Record<string, unknown> } | null,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({ isLoading: false, isAuthenticated: sources.isAuthenticated }),
    useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) =>
      args !== "skip" && getFunctionName(query) === "users:getViewer" ? sources.answer : undefined,
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
  sources.answer = null;
  sources.session = null;
});

afterEach(cleanup);

describe("CreateRetroContent's retention note", () => {
  it("tells a permanent account the retro is kept on it", () => {
    sources.answer = { name: "Ada", avatarUrl: null, email: "ada@example.com", isPermanent: true };

    expect(retentionNote()).toBe(KEPT);
  });

  it.each([
    ["a guest", { name: "Guest 4829", avatarUrl: null, email: null, isPermanent: false }],
    ["someone signed in with no users row yet", { name: null, avatarUrl: null, email: null, isPermanent: false }],
  ])("says guest retros are removed to %s, whatever BetterAuth's session says", (_, answer) => {
    sources.answer = answer;
    sources.session = { user: { id: "auth-bob", isAnonymous: false, email: "bob@example.com" } };

    expect(retentionNote()).toContain(REMOVED);
  });

  it("says guest retros are removed to a visitor", () => {
    sources.isAuthenticated = false;

    expect(retentionNote()).toContain(REMOVED);
  });
});
