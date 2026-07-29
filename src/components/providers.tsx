"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { AuthProvider } from "./auth/auth-provider";
import { ThemeProvider } from "next-themes";
import { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";

// This will be undefined until you run `npx convex dev` and set up your project
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  if (!convex) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Setup Required</h1>
          <p className="mb-4">Please run the following command to set up Convex:</p>
          <code className="bg-gray-100 p-2 rounded">npx convex dev</code>
          <p className="mt-4">Then add the NEXT_PUBLIC_CONVEX_URL to your .env.local file</p>
        </div>
      </div>
    );
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
      <ThemeProvider
        defaultTheme="system"
        storageKey="agilekit-theme"
        attribute="class"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ConvexBetterAuthProvider>
  );
}