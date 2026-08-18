"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

/** Whether the page is framed cannot change over the document's lifetime. */
const subscribeToNothing = () => () => {};

/**
 * Renders `children` only when this document is the top-level one.
 *
 * The root layout already drops framed chrome server-side via
 * `isEmbeddedDocument()`, which is what keeps it out of the markup entirely.
 * This is the fallback for the requests that check cannot see (no
 * `Sec-Fetch-Dest`): the server snapshot leaves the hydrated markup unchanged,
 * then the client snapshot removes the subtree.
 *
 * Everything wrapped here injects its scripts on mount rather than into the
 * server HTML, so a framed document never runs them even when the header is
 * missing and the markup was sent.
 */
export function TopLevelOnly({ children }: { children: ReactNode }) {
  const isFramed = useSyncExternalStore(
    subscribeToNothing,
    () => window.self !== window.top,
    () => false,
  );

  return isFramed ? null : children;
}
