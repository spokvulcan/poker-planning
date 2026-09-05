import type { TallyRead, TopicRef } from "@/convex/model/retroVotes";
import { NO_VOTE_BUDGET, TOPIC_VOTES_CAPPED, VOTE_BUDGET_SPENT } from "@/convex/retroCopy";

/**
 * Dots on the client (spec §10.8, §11): the local refusal reads the same
 * rule the server enforces — the viewer's own count in the tally against
 * the entry's budget and the topic's cap — so a sixth dot never leaves the
 * browser. Pure, so a node test proves it.
 */

/** The tally's key for a topic: its row id, as the server keys it. */
export const topicKey = (target: TopicRef): string => target.id;

/** Why a dot on the topic would be refused, or null when it would land. */
export function dotRefusal(tally: TallyRead | undefined, key: string): string | null {
  if (!tally || tally.budget === undefined) return NO_VOTE_BUDGET;
  if (tally.spent >= tally.budget) return VOTE_BUDGET_SPENT;
  if (tally.maxPerTopic !== undefined && (tally.mine[key] ?? 0) >= tally.maxPerTopic) return TOPIC_VOTES_CAPPED;
  return null;
}

export interface TopicDots {
  /** Everyone's dots, when the entry shows them. */
  count?: number;
  /** The viewer's own dots on the topic. */
  mine: number;
}

/** What the topic shows: the aggregate when visible, own dots always. */
export function dotsOf(tally: TallyRead | undefined, topicKey: string): TopicDots {
  if (!tally) return { mine: 0 };
  return {
    ...(tally.visible ? { count: tally.counts[topicKey] ?? 0 } : {}),
    mine: tally.mine[topicKey] ?? 0,
  };
}

/** The viewer's remaining dots on the current entry, when it takes any. */
export function dotsLeft(tally: TallyRead | undefined): number | undefined {
  if (!tally || tally.budget === undefined) return undefined;
  return Math.max(0, tally.budget - tally.spent);
}
