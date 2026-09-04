import type { RetroTint } from "@/convex/model/retroFormats";

/**
 * The tint tokens as Tailwind classes, spelled out per tint so the JIT
 * scanner sees every class. A stored `color` outside the palette (a later
 * edit, a hand-written client) falls back to the surface tokens.
 */
const TINT_CLASSES: Record<RetroTint, { zone: string; label: string }> = {
  red: { zone: "bg-tint-red-bg border-tint-red-fg/30", label: "text-tint-red-fg" },
  orange: { zone: "bg-tint-orange-bg border-tint-orange-fg/30", label: "text-tint-orange-fg" },
  amber: { zone: "bg-tint-amber-bg border-tint-amber-fg/30", label: "text-tint-amber-fg" },
  green: { zone: "bg-tint-green-bg border-tint-green-fg/30", label: "text-tint-green-fg" },
  teal: { zone: "bg-tint-teal-bg border-tint-teal-fg/30", label: "text-tint-teal-fg" },
  blue: { zone: "bg-tint-blue-bg border-tint-blue-fg/30", label: "text-tint-blue-fg" },
  violet: { zone: "bg-tint-violet-bg border-tint-violet-fg/30", label: "text-tint-violet-fg" },
  pink: { zone: "bg-tint-pink-bg border-tint-pink-fg/30", label: "text-tint-pink-fg" },
};

const FALLBACK = { zone: "bg-surface-2 border-border", label: "text-muted-foreground" };

export function tintClasses(color: string): { zone: string; label: string } {
  return (TINT_CLASSES as Record<string, { zone: string; label: string }>)[color] ?? FALLBACK;
}
