/**
 * Semantic zoom (spec §10.2, ADR-0011): three levels derived from the
 * viewport zoom. Zooming out changes resolution, never loses information:
 * detail draws the full card, headline the clamped first line and tint,
 * shape a tinted block with cluster labels held at constant screen size as
 * the content. Card size is a function of level and is never stored.
 */

import { CARD_MIN_HEIGHT, CARD_WIDTH } from "./cards";

export type ZoomLevel = "detail" | "headline" | "shape";

/** Above this zoom the card is drawn in full. */
export const DETAIL_ABOVE = 0.7;
/** Below this zoom the card is a tinted block. */
export const SHAPE_BELOW = 0.35;

/** detail above 0.70; headline from 0.35 to 0.70 inclusive; shape below 0.35. */
export function zoomLevelOf(zoom: number): ZoomLevel {
  if (zoom > DETAIL_ABOVE) return "detail";
  if (zoom < SHAPE_BELOW) return "shape";
  return "headline";
}

export interface CardSize {
  width: number;
  /** The fixed height at headline and shape; `undefined` at detail, where the text sets it. */
  height: number | undefined;
}

export const HEADLINE_HEIGHT = 56;
/** The shape block is the minimum card height, so centroids and tidy agree with detail. */
export const SHAPE_HEIGHT = CARD_MIN_HEIGHT;

/** The card's box per level: width always, height fixed below detail. */
export function cardSizeAt(level: ZoomLevel): CardSize {
  switch (level) {
    case "detail":
      return { width: CARD_WIDTH, height: undefined };
    case "headline":
      return { width: CARD_WIDTH, height: HEADLINE_HEIGHT };
    case "shape":
      return { width: CARD_WIDTH, height: SHAPE_HEIGHT };
  }
}

/** The first line of a card, clamped for the headline level. */
export function headlineOf(text: string, maxChars = 60): string {
  const line = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return line.length > maxChars ? `${line.slice(0, maxChars - 1).trimEnd()}…` : line;
}
