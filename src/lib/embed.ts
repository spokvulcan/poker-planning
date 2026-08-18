import { headers } from "next/headers";

/**
 * True when this document is being rendered inside a frame rather than as a
 * top-level page. The marketing hero embeds `/demo?embed=true` in an iframe,
 * and that framed document goes through the same root layout as the page
 * hosting it — so anything the layout renders globally (the analytics consent
 * banner) would otherwise appear twice on screen at once.
 *
 * Detection uses the `Sec-Fetch-Dest` fetch-metadata header, which the browser
 * sets to `iframe` on the framed navigation and `document` on the top-level
 * one. A request that arrives without the header (Safari below 16.4, or a
 * proxy that strips it) reads as not-embedded, so the caller falls back to
 * rendering exactly what it renders today.
 */
export async function isEmbeddedDocument(): Promise<boolean> {
  const requestHeaders = await headers();
  const destination = requestHeaders.get("sec-fetch-dest");

  return destination === "iframe" || destination === "frame";
}
