/**
 * How a retro write treats a row's optional fields (a sticky's GIF, an
 * action item's owner), and how an owner is named: the same rules in the
 * model (model/retro.ts) and in the board's optimistic updates
 * (src/components/retro/board-view.ts), so the board shows what the server
 * will. Pure: no IO, no Convex runtime.
 */

/**
 * An optional field after an edit: kept when the edit leaves it out, taken
 * off for `null`, else the edit's value.
 */
export function edited<T>(current: T | undefined, edit: T | null | undefined): T | undefined {
  return edit === undefined ? current : (edit ?? undefined);
}

/**
 * An action item's owner as the action items read names them: by `nameOf`,
 * or by id alone when it has no name to give.
 */
export function ownedBy<UserId extends string>(
  ownerId: UserId | undefined,
  nameOf: (ownerId: UserId) => string | undefined
): { ownerId?: UserId; ownerName?: string } {
  if (!ownerId) return {};
  const ownerName = nameOf(ownerId);
  return ownerName === undefined ? { ownerId } : { ownerId, ownerName };
}
