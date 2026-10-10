import type { Id, TableNames } from "@/convex/_generated/dataModel";

/**
 * The id a row an optimistic update adds wears until the server's arrives,
 * on either board: a retro's new sticky or action item, a poker voter's
 * first vote. Nothing can be done to it until then.
 */
export const OPTIMISTIC_PREFIX = "optimistic:";

/** Whether an id is still the client's stand-in. */
export function isOptimistic(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

/** A new row's stand-in id, from a key the client made for it. */
export function optimisticId<T extends TableNames>(key: string): Id<T> {
  return `${OPTIMISTIC_PREFIX}${key}` as Id<T>;
}
