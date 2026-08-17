/**
 * Voting scale definitions for planning poker.
 * These define the available card values for different estimation methods.
 */

export const VOTING_SCALES = {
  fibonacci: {
    type: "fibonacci" as const,
    label: "Fibonacci",
    description: "0, 1, 2, 3, 5, 8, 13, 21...",
    cards: [
      "0",
      "1",
      "2",
      "3",
      "5",
      "8",
      "13",
      "21",
      "34",
      "55",
      "89",
      "∞",
      "?",
      "☕",
    ],
    isNumeric: true,
  },
  standard: {
    type: "standard" as const,
    label: "Standard",
    description: "0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100",
    cards: [
      "0",
      "0.5",
      "1",
      "2",
      "3",
      "5",
      "8",
      "13",
      "20",
      "40",
      "100",
      "?",
      "☕",
    ],
    isNumeric: true,
  },
  tshirt: {
    type: "tshirt" as const,
    label: "T-Shirt Sizes",
    description: "XS, S, M, L, XL, XXL",
    cards: ["XS", "S", "M", "L", "XL", "XXL", "?", "☕"],
    isNumeric: false,
  },
} as const;

export type VotingScaleType = keyof typeof VOTING_SCALES;

export type VotingScale = {
  type: VotingScaleType | "custom";
  cards: string[];
  isNumeric: boolean;
};

/** Custom scale validation limits — shared by argument validation and the model. */
export const SCALE_VALIDATION = {
  minCards: 3,
  maxCards: 20,
  maxCardLength: 10,
} as const;

/**
 * The one custom-scale validator. Throws on the first violated rule.
 * Lives here (not in the model) so the same rules back endpoint argument
 * validation and any direct Convex client — the model calls it on room
 * creation, so an oversized or malformed deck is unrepresentable.
 */
export function validateCustomScale(cards: string[]): void {
  if (cards.length < SCALE_VALIDATION.minCards) {
    throw new Error(`Minimum ${SCALE_VALIDATION.minCards} cards required`);
  }
  if (cards.length > SCALE_VALIDATION.maxCards) {
    throw new Error(`Maximum ${SCALE_VALIDATION.maxCards} cards allowed`);
  }
  if (new Set(cards).size !== cards.length) {
    throw new Error("Duplicate card values not allowed");
  }
  if (cards.some((c) => c.trim() === "")) {
    throw new Error("Empty card values not allowed");
  }
  if (cards.some((c) => c.length > SCALE_VALIDATION.maxCardLength)) {
    throw new Error(
      `Card values must be ${SCALE_VALIDATION.maxCardLength} characters or less`
    );
  }
}

/** Special cards that should not be included in numeric calculations */
export const SPECIAL_CARDS = ["∞", "?", "☕"];

/** Default scale when none is specified (backward compatibility) */
export const DEFAULT_SCALE = VOTING_SCALES.fibonacci;

/** Helper to get a predefined scale by type */
export function getScale(type: VotingScaleType): (typeof VOTING_SCALES)[VotingScaleType] {
  return VOTING_SCALES[type];
}

/** Check if a card value is numeric (excludes special cards) */
export function isNumericCard(cardLabel: string): boolean {
  if (SPECIAL_CARDS.includes(cardLabel)) return false;
  return !isNaN(parseFloat(cardLabel));
}
