"use client";

import { ConvexReactClient } from "convex/react";
import { AuthProvider } from "./auth/auth-provider";
import { ConvexSessionProvider } from "./auth/convex-session";
import type { Viewer } from "./auth/viewer";
import { CommandMenuProvider } from "./command-menu/command-menu";
import { ConvexSetupRequired } from "./convex-setup-required";
import { ReactNode } from "react";

// This will be undefined until you run `npx convex dev` and set up your project
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * The app shell, which the (app) layout mounts for every page but the demo:
 * Convex signed in with the browser's BetterAuth session, starting from the
 * token the layout fetched on the server, the auth provider, starting from
 * the viewer the layout read with it, and the ⌘K command menu.
 */
export function AppProviders({
  children,
  initialToken,
  initialViewer,
}: {
  children: ReactNode;
  initialToken?: string | null;
  initialViewer?: Viewer;
}) {
  if (!convex) {
    return <ConvexSetupRequired />;
  }

  return (
    <ConvexSessionProvider client={convex} initialToken={initialToken}>
      <AuthProvider initialViewer={initialViewer}>
        <CommandMenuProvider>{children}</CommandMenuProvider>
      </AuthProvider>
    </ConvexSessionProvider>
  );
}
