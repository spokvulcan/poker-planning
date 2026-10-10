import type { Scene } from "@/hooks/use-looping-scene";

/**
 * A voter picking a card, as the homepage's How it works and the features
 * page show it: the hand at rest, the third card lifted under the pointer,
 * then picked.
 */
export const PICK_A_CARD: Scene<{ hovered: number | null; selected: number | null }> = [
  { show: { hovered: null, selected: null }, hold: 1000 },
  { show: { hovered: 2, selected: null }, hold: 400 },
  { show: { hovered: 2, selected: 2 }, hold: 2500 },
];
