import type { Id } from "@/convex/_generated/dataModel";
import type { BoardCardRead, FullCard, ProjectedCard } from "@/convex/model/retro";

/**
 * A card as the board renders it, after the `retro.board` and `retro.mine`
 * merge (spec §9, §10.9). `hidden` is true iff the viewer has no text for
 * the card after the merge — a silhouette the viewer did not write.
 */
export interface BoardCard {
  _id: Id<"retroCards">;
  clientId: string;
  promptId: string;
  position: { x: number; y: number };
  clusterId?: Id<"retroClusters">;
  hidden: boolean;
  text?: string;
  authorId?: Id<"users">;
  /** The viewer wrote it: full text in `mine`, or the author in a visible entry. */
  own: boolean;
  /** Written after the walk's snapshot and outside its order (spec §12.3). */
  late: boolean;
}

function isFull(card: ProjectedCard): card is FullCard {
  return "text" in card;
}

/**
 * The merge: the board's order and positions, the viewer's own text from
 * `mine` where the board carries a silhouette. `mine` may still be loading.
 */
export function mergeCards(
  boardCards: readonly BoardCardRead[],
  mine: readonly FullCard[] | undefined,
  viewerId: Id<"users"> | undefined
): BoardCard[] {
  const own = new Map((mine ?? []).map((card) => [card.clientId, card]));
  return boardCards.map((card) => {
    const base = {
      _id: card._id,
      clientId: card.clientId,
      promptId: card.promptId,
      position: card.position,
      ...(card.clusterId !== undefined ? { clusterId: card.clusterId } : {}),
      late: card.late === true,
    };
    const full = isFull(card) ? card : own.get(card.clientId);
    if (!full) {
      return { ...base, hidden: true, own: false };
    }
    return {
      ...base,
      hidden: false,
      text: full.text,
      ...(full.authorId !== undefined ? { authorId: full.authorId } : {}),
      own: own.has(card.clientId) || (full.authorId !== undefined && full.authorId === viewerId),
    };
  });
}

export const CARD_WIDTH = 200;
export const CARD_MIN_HEIGHT = 96;

/**
 * Where a new card lands: inside its prompt's zone, staggered by how many
 * cards the zone already holds so a burst of writing does not stack. The
 * stored prompt is the composer's choice; the position is only a start.
 */
export function placeNewCard(
  zone: { x: number; y: number; width: number; height: number },
  existingCount: number
): { x: number; y: number } {
  const pad = 24;
  const columns = Math.max(1, Math.floor((zone.width - pad) / (CARD_WIDTH + pad)));
  const rows = Math.max(1, Math.floor((zone.height - 64) / (CARD_MIN_HEIGHT + pad)));
  const slot = existingCount % (columns * rows);
  const cycle = Math.floor(existingCount / (columns * rows));
  return {
    x: zone.x + pad + (slot % columns) * (CARD_WIDTH + pad) + cycle * 12,
    y: zone.y + 64 + Math.floor(slot / columns) * (CARD_MIN_HEIGHT + pad) + cycle * 12,
  };
}
