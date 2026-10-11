import { Id } from "../_generated/dataModel";
import { type Deck, cardNumericValue, isSpecialCard } from "../scales";

/**
 * Voter alignment — the pure computation behind the per-voter alignment
 * snapshot (CONTEXT.md: Voter Alignment; spec 04). No ctx, no IO: the round
 * module reads votes and persists rows; this module decides what each row is,
 * reading each card through the room's deck (`../scales`).
 */

/** A vote as the alignment computation reads it: who voted, with which card. */
export interface AlignmentVote {
  userId: Id<"users">;
  cardLabel?: string;
}

/** One voter's alignment with the consensus, snapshotted at reveal. */
export interface VoterAlignment {
  userId: Id<"users">;
  cardLabel: string;
  cardValue?: number;
  consensusLabel?: string;
  consensusValue?: number;
  /** Scale-index distance from consensus (positive = voted higher). */
  deltaSteps?: number;
}

/**
 * Computes each voter's alignment with the consensus. Special cards and
 * voteless rows are excluded (they carry no estimate to align). `deltaSteps`
 * is the distance from consensus in steps along the deck's numbers, lowest
 * to highest — only on a numeric deck, where both the vote and the consensus
 * are cards it deals.
 */
export function computeVoterAlignment(
  votes: AlignmentVote[],
  consensusLabel: string | null,
  deck: Deck
): VoterAlignment[] {
  // Each estimating card's step along the deck, from its lowest number to its
  // highest, whatever order the deck lays them out in: a creator's own deck
  // can list its numbers in any order, and put `?` among them. Special cards
  // hold no step.
  const stepOf = new Map(
    deck.cards
      .filter((card) => !isSpecialCard(card) && cardNumericValue(card) !== undefined)
      .sort((a, b) => cardNumericValue(a)! - cardNumericValue(b)!)
      .map((card, step) => [card, step] as const)
  );
  const numericScale = deck.isNumeric;

  const consensusStep = consensusLabel
    ? stepOf.get(consensusLabel)
    : undefined;
  const consensusValue =
    consensusLabel !== null ? cardNumericValue(consensusLabel) : undefined;

  return votes
    .filter((vote) => vote.cardLabel && !isSpecialCard(vote.cardLabel))
    .map((vote) => {
      const label = vote.cardLabel!;
      const voteStep = stepOf.get(label);
      const deltaSteps =
        numericScale && voteStep !== undefined && consensusStep !== undefined
          ? voteStep - consensusStep
          : undefined;

      return {
        userId: vote.userId,
        cardLabel: label,
        cardValue: cardNumericValue(label),
        consensusLabel: consensusLabel ?? undefined,
        consensusValue,
        deltaSteps,
      };
    });
}
