"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { AuthProvider } from "./auth/auth-provider";
import { ConvexSetupRequired } from "./convex-setup-required";
import { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

// This will be undefined until you run `npx convex dev` and set up your project
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * The app shell, which the (app) layout mounts for every page but the demo:
 * Convex signed in through BetterAuth, starting from the token the layout
 * fetched on the server, and the auth provider.
 */
export function AppProviders({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  if (!convex) {
    return <ConvexSetupRequired />;
  }

  return (
    // `authClient as AuthClient`: @convex-dev/better-auth@0.12.5 declares AuthClient as
    // `createAuthClient<BetterAuthClientPlugin & { plugins: ... }>`. That intersection is
    // malformed, and better-auth >=1.6.18's stricter session inference collapses
    // `useSession().data` to `never`, so our real client no longer structurally matches.
    // Type-level only — the runtime client is unchanged. We cannot stay on 1.6.17: it is
    // vulnerable to GHSA-qq9h-g4jm-xgf3 (CVSS 8.3 magic-link account takeover) and this app
    // enables the magicLink plugin. Remove once @convex-dev/better-auth ships past 0.12.5.
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient as unknown as AuthClient}
      initialToken={initialToken}
    >
      <AuthProvider>{children}</AuthProvider>
    </ConvexBetterAuthProvider>
  );
}
