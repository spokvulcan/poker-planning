import { SPECIAL_CARDS } from "./scales";

/**
 * summarize — the ONE pure computation of a round's results.
 *
 * Read by reveal (snapshotted onto the issue), the enhanced export (via that
 * snapshot), and the client results panel — so the live numbers can never
 * diverge from the stored/exported ones. Special cards (`?`, `☕`, `∞`) are
 * excluded from consensus and the numeric stats; they still appear in the
 * distribution so the panel can show every card cast.
 */

export interface SummaryVote {
  cardLabel?: string;
}

export interface VoteStatsSummary {
  average: number | null;
  median: number | null;
  agreement: number; // % of counted (non-special) votes on the consensus
  voteCount: number; // counted (non-special) votes
}

export interface VoteSummary {
  consensus: string | null;
  stats: VoteStatsSummary;
  distribution: Array<{ label: string; count: number }>;
}

export function summarize(
  votes: SummaryVote[],
  scale?: { isNumeric: boolean }
): VoteSummary {
  const labels = votes
    .map((v) => v.cardLabel)
    .filter((l): l is string => !!l && !SPECIAL_CARDS.includes(l));

  const counts: Record<string, number> = {};
  for (const label of labels) counts[label] = (counts[label] ?? 0) + 1;

  const voteCount = labels.length;
  const maxCount = voteCount > 0 ? Math.max(...Object.values(counts)) : 0;

  // Consensus: the mode, with a lower-numeric (else alphabetical) tie-break.
  let consensus: string | null = null;
  if (voteCount > 0) {
    const modes = Object.keys(counts).filter((l) => counts[l] === maxCount);
    if (modes.length === 1) {
      consensus = modes[0];
    } else {
      // Tie-break toward the lowest numeric value, but return the original
      // label (not the reparsed number) so it round-trips for non-canonical
      // decks like "1.0"; fall back to alphabetical for non-numeric ties.
      const numericModes = modes.filter((m) => !isNaN(parseFloat(m)));
      consensus =
        numericModes.length > 0
          ? numericModes.reduce((lo, m) =>
              parseFloat(m) < parseFloat(lo) ? m : lo
            )
          : [...modes].sort()[0];
    }
  }

  // Agreement: share of counted votes on the consensus.
  const agreement = voteCount > 0 ? Math.round((maxCount / voteCount) * 100) : 0;

  // Average/median over numeric counted votes — only for numeric scales. An
  // absent scale defaults to numeric: the default scale is numeric and the
  // client renders these via `votingScale?.isNumeric ?? true`, so the stored
  // stats must use the same default or the two diverge (ADR-0002).
  let average: number | null = null;
  let median: number | null = null;
  if (scale?.isNumeric ?? true) {
    const numericVotes = labels
      .map((l) => parseFloat(l))
      .filter((n) => !isNaN(n));
    if (numericVotes.length > 0) {
      average =
        numericVotes.reduce((sum, v) => sum + v, 0) / numericVotes.length;
      const sorted = [...numericVotes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      median =
        sorted.length % 2 !== 0
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
    }
  }

  // Distribution covers every cast card (specials included), numeric values
  // ascending then non-numeric/special alphabetically — the order the panel renders.
  const distCounts: Record<string, number> = {};
  for (const v of votes) {
    if (v.cardLabel) distCounts[v.cardLabel] = (distCounts[v.cardLabel] ?? 0) + 1;
  }
  const distribution = Object.entries(distCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      const na = parseFloat(a.label);
      const nb = parseFloat(b.label);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.label.localeCompare(b.label);
    });

  return { consensus, stats: { average, median, agreement, voteCount }, distribution };
}
