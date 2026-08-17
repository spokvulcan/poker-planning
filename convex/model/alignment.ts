import { Id } from "../_generated/dataModel";
import { SPECIAL_CARDS, VotingScale } from "../scales";

/**
 * Voter alignment — the pure computation behind the per-voter alignment
 * snapshot (CONTEXT.md: Voter Alignment; spec 04). No ctx, no IO: the round
 * module reads votes and persists rows; this module decides what each row is.
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
 * The ONE card→numeric conversion, shared by the round (vote writes, the
 * alignment snapshot) and `summarize` (result stats). Returns `undefined` for
 * non-numeric labels (special cards, t-shirt sizes) instead of NaN so callers
 * can't leak NaN into stored stats.
 */
export function cardNumericValue(cardLabel: string): number | undefined {
  const value = Number.parseFloat(cardLabel);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Computes each voter's alignment with the consensus. Special cards and
 * voteless rows are excluded (they carry no estimate to align). `deltaSteps`
 * is the scale-index distance from consensus — only for numeric scales where
 * both the vote and the consensus are on the scale.
 */
export function computeVoterAlignment(
  votes: AlignmentVote[],
  consensusLabel: string | null,
  votingScale: VotingScale | undefined
): VoterAlignment[] {
  // Scale index map for deltaSteps; special cards hold no scale position.
  const scaleIndexMap = new Map<string, number>();
  (votingScale?.cards ?? []).forEach((card, idx) => {
    if (!SPECIAL_CARDS.includes(card)) {
      scaleIndexMap.set(card, idx);
    }
  });
  const numericScale = votingScale?.isNumeric ?? false;

  const consensusIndex = consensusLabel
    ? scaleIndexMap.get(consensusLabel)
    : undefined;
  const consensusValue =
    consensusLabel !== null ? cardNumericValue(consensusLabel) : undefined;

  return votes
    .filter((vote) => vote.cardLabel && !SPECIAL_CARDS.includes(vote.cardLabel))
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
