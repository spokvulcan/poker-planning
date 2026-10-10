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
 * is the scale-index distance from consensus — only on a numeric deck, where
 * both the vote and the consensus are cards it deals.
 */
export function computeVoterAlignment(
  votes: AlignmentVote[],
  consensusLabel: string | null,
  deck: Deck
): VoterAlignment[] {
  // Scale index map for deltaSteps; special cards hold no scale position.
  const scaleIndexMap = new Map<string, number>();
  deck.cards.forEach((card, idx) => {
    if (!isSpecialCard(card)) {
      scaleIndexMap.set(card, idx);
    }
  });
  const numericScale = deck.isNumeric;

  const consensusIndex = consensusLabel
    ? scaleIndexMap.get(consensusLabel)
    : undefined;
  const consensusValue =
    consensusLabel !== null ? cardNumericValue(consensusLabel) : undefined;

  return votes
    .filter((vote) => vote.cardLabel && !isSpecialCard(vote.cardLabel))
    .map((vote) => {
      const label = vote.cardLabel!;
      const voteIndex = scaleIndexMap.get(label);
      const deltaSteps =
        numericScale && voteIndex !== undefined && consensusIndex !== undefined
          ? voteIndex - consensusIndex
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
