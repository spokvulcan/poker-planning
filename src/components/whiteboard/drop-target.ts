/** A node's place and size on the board. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Which node a dragged one would land on: the first candidate whose box
 * holds the dragged node's centre. Pure.
 */
export function dropTargetAt<T extends { box: Box }>(dragged: Box, candidates: readonly T[]): T | undefined {
  const cx = dragged.x + dragged.width / 2;
  const cy = dragged.y + dragged.height / 2;
  return candidates.find(
    ({ box }) => cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height
  );
}
