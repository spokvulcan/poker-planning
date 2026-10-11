/**
 * Voting scale definitions for planning poker, and the deck they deal.
 * A scale is the cards a room stores, picked when it is created; the deck says
 * what those cards mean: which are dealt, whether a label is a legal ballot,
 * and what a card reads as a number. A creator's pick is read here too: the
 * cards it deals, whether a room can be dealt it, and the scale the room
 * stores. Pure, so the server and the browser read a card, and a pick, one
 * way (CONTEXT.md: Deck).
 */

import { fieldRule } from "./fieldRule";

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

/** A plain decimal number, and nothing else: "5", "0.5", "-1", ".5". */
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * What a label reads as a number: the ONE numeric reading. It needs no deck,
 * so analytics shares it for final estimates, which can be free text. Only a
 * label that is a plain number reads as one: a special card, a word, a
 * number with something after it ("2d", "5 points", "1,5") or a non-finite
 * one such as "Infinity" reads as none, `undefined`, never NaN, so no stat
 * guesses at a number or stores NaN or an infinity, and a custom deck of
 * "1d, 2d, 3d" isn't taken for a deck of numbers.
 */
export function cardNumericValue(label: string): number | undefined {
  const text = label.trim();
  if (isSpecialCard(text) || !PLAIN_NUMBER.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// A creator's pick
// ---------------------------------------------------------------------------

const MIN_CARDS = 3;
const MAX_CARDS = 20;
const MAX_CARD_LENGTH = 10;

/**
 * A custom deck's limits, and a card's own rule beside its limit and words:
 * kept without the spaces around it, never blank, and short (`./fieldRule`).
 * The rest of a deck's rules, no card twice and how many cards, are read
 * with them in one place, `checkPick`, which room creation and the create
 * page's table both ask.
 */
export const CUSTOM_DECK = {
  minCards: MIN_CARDS,
  maxCards: MAX_CARDS,
  card: fieldRule({
    maxLength: MAX_CARD_LENGTH,
    blank: "A card can't be blank.",
    tooLong: `A card fits ${MAX_CARD_LENGTH} characters.`,
  }),
} as const;

/**
 * What a room's creator picks: a preset by its type, or a deck of their own,
 * its cards as typed. The shape `rooms.create` takes, so a pick an old open
 * tab sends reads the same; a preset ignores any cards sent with it.
 */
export type DeckPick =
  | { type: VotingScaleType; cards?: readonly string[] }
  | { type: "custom"; cards?: readonly string[] };

/**
 * The first rule a custom deck breaks, classified, and in the rule's own
 * words: a card's own rule (blank, or too long), a card it already holds
 * (`card`, as the deck keeps it), more cards than it holds, or fewer than it
 * needs. The create page's table reacts to which; the words are what a
 * person reads, from the table or from a refused room creation.
 */
export type BrokenRule =
  | { rule: "card" | "tooMany" | "tooFew"; message: string }
  | { rule: "duplicate"; card: string; message: string };

/**
 * A pick, read: the cards it deals, in order, each as the deck keeps it, and
 * either the scale a room stores for it or the first rule it breaks. A deck
 * that breaks one still says the cards it keeps, leaving out a card it
 * refuses, so the create page lays out a deck that is only short of cards.
 */
export type CheckedPick =
  | { ok: true; cards: readonly string[]; scale: VotingScale }
  | ({ ok: false; cards: readonly string[] } & BrokenRule);

/**
 * The ONE reading of a creator's pick (CONTEXT.md: Deck). The create page asks
 * it on every change, its table asks it of each card laid, and room creation
 * stores its answer, so the page can't offer a deck the server refuses, nor
 * show cards the room won't deal. No pick reads as the default. A custom
 * deck's cards are read in order, the first one refused saying why; then its
 * size.
 */
export function checkPick(pick?: DeckPick): CheckedPick {
  if (pick?.type !== "custom") {
    const { type, cards, isNumeric } = pick ? VOTING_SCALES[pick.type] : DEFAULT_SCALE;
    return { ok: true, cards, scale: { type, cards: [...cards], isNumeric } };
  }
  const cards: string[] = [];
  let broken: BrokenRule | null = null;
  for (const typed of pick.cards ?? []) {
    const card = CUSTOM_DECK.card.check(typed);
    if (!card.ok) {
      broken ??= { rule: "card", message: card.message };
    } else if (cards.includes(card.value)) {
      // Compared as kept, so two cards equal once trimmed are the same card.
      broken ??= { rule: "duplicate", card: card.value, message: `${card.value} is already in the deck.` };
    } else {
      cards.push(card.value);
    }
  }
  broken ??= sizeRule(cards.length);
  return broken
    ? { ok: false, cards, ...broken }
    : { ok: true, cards, scale: { type: "custom", cards, isNumeric: isNumericDeck(cards) } };
}

/** The rule a deck of `count` cards breaks by its size alone, or null when it breaks none. */
function sizeRule(count: number): BrokenRule | null {
  if (count > MAX_CARDS) return { rule: "tooMany", message: `A deck holds ${MAX_CARDS} cards at most.` };
  if (count < MIN_CARDS) {
    return { rule: "tooFew", message: `Add ${MIN_CARDS - count} more: a deck needs at least ${MIN_CARDS} cards.` };
  }
  return null;
}

/**
 * Whether a custom deck is numeric, so its results average: at least one card
 * reads as a number, and every card but the special ones does. "1, 2, 3, 5,
 * 8, ?" is; "S, M, L" and "1, 2, Spike" aren't. The presets agree with it.
 */
function isNumericDeck(cards: readonly string[]): boolean {
  return (
    cards.some((card) => cardNumericValue(card) !== undefined) &&
    cards.every((card) => isSpecialCard(card) || cardNumericValue(card) !== undefined)
  );
}
