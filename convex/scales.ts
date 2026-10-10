/**
 * Voting scale definitions for planning poker, and the deck they deal.
 * A scale is the cards a room stores, picked when it is created; the deck says
 * what those cards mean: which are dealt, whether a label is a legal ballot,
 * and what a card reads as a number. Pure, so the server and the browser read
 * a card one way (CONTEXT.md: Deck).
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

/**
 * The one default scale: what a room that stores none deals (legacy rooms and
 * the demo), and what a new room stores when its creator picks none.
 */
export const DEFAULT_SCALE = VOTING_SCALES.fibonacci;

/** A room's deck: what its cards mean, read from its stored scale by `deckOf`. */
export interface Deck {
  /** The cards dealt, in the order the card row lays them out. */
  readonly cards: readonly string[];
  /**
   * Whether results average the deck: a numeric deck shows an average and a
   * median, and counts each voter's steps from the consensus.
   */
  readonly isNumeric: boolean;
  /** Whether a label is a legal ballot: a card this deck deals. */
  isLegalBallot(label: string): boolean;
}

/**
 * The deck a room's stored scale deals. The one place a missing scale is
 * resolved: a room that stores none deals the default.
 */
export function deckOf(scale?: Pick<VotingScale, "cards" | "isNumeric">): Deck {
  const { cards, isNumeric }: Pick<Deck, "cards" | "isNumeric"> =
    scale ?? DEFAULT_SCALE;
  return { cards, isNumeric, isLegalBallot: (label) => cards.includes(label) };
}

/**
 * The special cards: `∞` (too big to estimate), `?` (unsure) and `☕` (a
 * break). Dealt and played like any other card, they estimate nothing: no
 * consensus, average or alignment counts them, and they read as no number.
 */
const SPECIAL_CARDS: readonly string[] = ["∞", "?", "☕"];

/** Whether a card is special: played, but an estimate of nothing. */
export function isSpecialCard(label: string): boolean {
  return SPECIAL_CARDS.includes(label);
}

/**
 * What a label reads as a number: the ONE numeric reading. It needs no deck,
 * so analytics shares it for final estimates, which can be free text. A
 * special card, a word or a non-finite number such as "Infinity" reads as
 * none: `undefined`, never NaN, so no stat can store NaN or an infinity.
 */
export function cardNumericValue(label: string): number | undefined {
  if (isSpecialCard(label)) return undefined;
  const value = Number.parseFloat(label);
  return Number.isFinite(value) ? value : undefined;
}
