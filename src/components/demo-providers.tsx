"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";
import { ConvexSetupRequired } from "./convex-setup-required";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// The demo's own client, which never connects. A client opens its socket on
// first use, and this one is never handed a token and only ever sees skipped
// queries. It exists because `useQuery` and `useMutation` throw without one,
// skipped or not.
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * The demo shell, which the (demo) layout mounts for /demo: a Convex client
 * with no auth, and no BetterAuth or auth provider (ADR-0003).
 */
export function DemoProviders({ children }: { children: ReactNode }) {
  if (!convex) {
    return <ConvexSetupRequired />;
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
