import { sendGAEvent } from "@next/third-parties/google";

/**
 * The conversions search traffic is judged by: a person who arrives from a
 * search result and starts a game or a retro. Each is its own named Google
 * Analytics event, so it can be marked as a key event and read per landing
 * page.
 */
export type Conversion = "create_poker_room" | "create_retro";

/**
 * Records a conversion when Google Analytics is running. It loads only with
 * the visitor's consent and never inside the demo frame; without it there is
 * no data layer, and the event is dropped instead of queued.
 */
export function trackConversion(conversion: Conversion): void {
  if (typeof window === "undefined" || !("dataLayer" in window)) return;
  sendGAEvent("event", conversion);
}

/**
 * How the retro's GIFs get used: a typed search, a GIF picked from search
 * or a pasted link, and a search GIPHY refused for its hourly rate limit.
 * Never the search terms. Like a conversion, sent only while Google
 * Analytics is running.
 */
export type GifEvent = "gif_search" | "gif_pick" | "gif_search_limited";

export function trackGifEvent(event: GifEvent, params?: { source: "search" | "link" }): void {
  if (typeof window === "undefined" || !("dataLayer" in window)) return;
  sendGAEvent("event", event, params ?? {});
}
