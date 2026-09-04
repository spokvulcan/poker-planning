/**
 * Prompt soft zones (ADR-0011): a zone per prompt, drawn from the stamped
 * format, laid out in prompt order and wrapping into rows. Pure, so the
 * board derives its zone nodes by memo and a node test proves the layout.
 */

export const ZONE_WIDTH = 480;
export const ZONE_HEIGHT = 640;
export const ZONE_GAP = 40;
export const ZONES_PER_ROW = 5;

import type { FormatPrompt } from "@/convex/model/retroFormats";

export type ZonePrompt = Pick<FormatPrompt, "id" | "label" | "color" | "order">;

// A type alias, not an interface: React Flow node data must satisfy
// Record<string, unknown>, which an interface's closed shape does not.
export type Zone = {
  promptId: string;
  label: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function layoutZones(prompts: readonly ZonePrompt[]): Zone[] {
  return [...prompts]
    .sort((a, b) => a.order - b.order)
    .map((prompt, i) => ({
      promptId: prompt.id,
      label: prompt.label,
      color: prompt.color,
      x: (i % ZONES_PER_ROW) * (ZONE_WIDTH + ZONE_GAP),
      y: Math.floor(i / ZONES_PER_ROW) * (ZONE_HEIGHT + ZONE_GAP),
      width: ZONE_WIDTH,
      height: ZONE_HEIGHT,
    }));
}
