"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/convex/_generated/api";

interface AuthContextType {
  // BetterAuth user ID (needed for join/ensureGlobalUser race condition)
  authUserId: string | null;
  // Whether the user is anonymous (from BetterAuth session)
  isAnonymous: boolean;
  // Auth loading state (from Convex - waits for token validation)
  isLoading: boolean;
  // Whether user is authenticated (from Convex - token validated)
  isAuthenticated: boolean;
  // User's email address (for permanent accounts)
  email: string | null;
  // Whether this is a guest or permanent account
  accountType: "anonymous" | "permanent" | null;
}

const AuthContext = createContext<AuthContextType>({
  authUserId: null,
  isAnonymous: false,
  isLoading: true,
  isAuthenticated: false,
  email: null,
  accountType: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Use Convex's auth state - this waits for token validation
  // Per docs: "Better Auth will reflect an authenticated user before Convex does"
  const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();

  // Still need BetterAuth session for authUserId (used in mutations)
  const { data: session } = authClient.useSession();
  const authUserId = session?.user?.id;

  // Zero reads on /demo (ADR-0003): the demo is a client-side simulation with
  // no backend participation, so even this root subscription must not open for a
  // returning visitor with a live session. Route-based (not the
  // DemoSimulationProvider seam) because AuthProvider sits at the root, above
  // the provider. On /demo the session fallbacks below already supply email and
  // accountType, so context consumers see the same values.
  const pathname = usePathname();
  const isDemoRoute = pathname === "/demo" || pathname.startsWith("/demo/");

  const globalUser = useQuery(
    api.users.getGlobalUser,
    isAuthenticated && !isDemoRoute ? {} : "skip"
  );

  // Memoize context value to prevent cascading re-renders in consumers
  const value = useMemo(
    () => ({
      authUserId: authUserId ?? null,
      isAnonymous: session?.user?.isAnonymous ?? false,
      isLoading: convexAuthLoading,
      isAuthenticated,
      // For permanent accounts, fall back to BetterAuth session email when app user email isn't set yet
      // (e.g., merge case race condition where auto-join creates user before onLinkAccount).
      // Anonymous users get a fake temp@xxx.com email from BetterAuth — never expose it.
      email: globalUser?.email ?? (session?.user?.isAnonymous ? null : session?.user?.email ?? null),
      accountType: globalUser?.accountType ?? (session?.user?.isAnonymous === false ? "permanent" : null),
    }),
    [session, convexAuthLoading, isAuthenticated, globalUser, authUserId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
