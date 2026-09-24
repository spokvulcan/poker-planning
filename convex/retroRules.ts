/**
 * The retro's rules that both sides compute: which sticky a stack is filed
 * under, how votes add up, the order the discussion walks, and which GIF
 * links a sticky may carry. Pure: no IO, no Convex runtime, so the model and
 * the board derive the same answer from the same rows.
 */

import type { RetroColumn, RetroStep } from "./retroTemplates";

/** The fields of a sticky the rules read. */
export interface StickyRef {
  _id: string;
  columnId: string;
  stackId?: string;
  createdAt: number;
}

/**
 * The sticky a stack is filed under. A sticky dropped on another joins that
 * sticky's stack; stacks are one level deep, so the root is the sticky
 * itself or the one it points at.
 */
export function rootOf(sticky: Pick<StickyRef, "_id" | "stackId">): string {
  return sticky.stackId ?? sticky._id;
}

/**
 * Who tops a stack once its top is gone: the oldest sticky left in it.
 */
export function heirOf<T extends Pick<StickyRef, "createdAt">>(members: readonly T[]): T | undefined {
  return [...members].sort((a, b) => a.createdAt - b.createdAt)[0];
}

/**
 * Votes per topic. A topic is a loose sticky or a whole stack, and a vote on
 * any sticky in a stack counts for the stack, so stacking and unstacking
 * never lose a vote.
 */
export function voteTotals(
  stickies: readonly Pick<StickyRef, "_id" | "stackId">[],
  votes: readonly { stickyId: string }[]
): Map<string, number> {
  const rootById = new Map(stickies.map((s) => [s._id, rootOf(s)]));
  const totals = new Map<string, number>();
  for (const vote of votes) {
    const root = rootById.get(vote.stickyId);
    if (root === undefined) continue;
    totals.set(root, (totals.get(root) ?? 0) + 1);
  }
  return totals;
}

/**
 * The order the discussion walks: every topic that got a vote, most votes
 * first. When nobody voted, every topic, column by column. Ties go to the
 * column order, then to whichever was written first.
 */
export function discussionOrder(
  stickies: readonly StickyRef[],
  totals: ReadonlyMap<string, number>,
  columns: readonly Pick<RetroColumn, "id">[]
): string[] {
  const columnIndex = new Map(columns.map((c, i) => [c.id, i]));
  const roots = stickies.filter((s) => s.stackId === undefined);
  const anyVotes = roots.some((s) => (totals.get(s._id) ?? 0) > 0);
  return roots
    .filter((s) => !anyVotes || (totals.get(s._id) ?? 0) > 0)
    .sort(
      (a, b) =>
        (totals.get(b._id) ?? 0) - (totals.get(a._id) ?? 0) ||
        (columnIndex.get(a.columnId) ?? Infinity) - (columnIndex.get(b.columnId) ?? Infinity) ||
        a.createdAt - b.createdAt
    )
    .map((s) => s._id);
}

/**
 * The topic after (or before) `current` in the walk. Unknown or missing
 * `current` starts the walk from the top; stepping past either end stays put.
 */
export function stepFocus(
  order: readonly string[],
  current: string | undefined,
  direction: "next" | "previous"
): string | undefined {
  if (order.length === 0) return undefined;
  const index = current === undefined ? -1 : order.indexOf(current);
  if (index === -1) return order[0];
  const next = direction === "next" ? index + 1 : index - 1;
  return order[Math.min(Math.max(next, 0), order.length - 1)];
}

/** Where the retro goes when a topic is put in the spotlight: to the discussion, unless it's done. */
export function stepOnFocus(step: RetroStep): RetroStep {
  return step === "done" ? "done" : "discuss";
}

// --- GIFs ---------------------------------------------------------------------

const GIPHY_MEDIA_HOST = /^(media\d?|i)\.giphy\.com$/;
const TENOR_MEDIA_HOST = /^(media\d?|c)\.tenor\.com$/;
const IMGUR_MEDIA_HOST = /^i\.imgur\.com$/;
const IMAGE_PATH = /\.(gif|webp|png|jpe?g)$/i;

/**
 * The link a sticky stores for a GIF, or null when the link is not one we
 * embed. Only GIPHY, Tenor and Imgur media hosts are embedded, over https,
 * so a sticky can never make every teammate's browser call an arbitrary
 * server. A GIPHY page link (giphy.com/gifs/…) is rewritten to its media
 * file; a Tenor page link cannot be, and is refused.
 */
export function normalizeGifUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();

  if (host === "giphy.com" || host === "www.giphy.com") {
    const match = url.pathname.match(/^\/(?:gifs|stickers)\/(?:[\w-]*-)?([A-Za-z0-9]+)\/?$/);
    return match ? `https://media.giphy.com/media/${match[1]}/giphy.gif` : null;
  }
  if (GIPHY_MEDIA_HOST.test(host) || TENOR_MEDIA_HOST.test(host)) {
    return url.toString();
  }
  if (IMGUR_MEDIA_HOST.test(host) && IMAGE_PATH.test(url.pathname)) {
    return url.toString();
  }
  return null;
}
