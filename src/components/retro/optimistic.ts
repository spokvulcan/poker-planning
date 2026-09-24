/** The id an optimistic row wears until the server's arrives. */
export const OPTIMISTIC_PREFIX = "optimistic:";

/** Whether an id is still the client's stand-in: nothing can be done to it yet. */
export function isOptimistic(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}
