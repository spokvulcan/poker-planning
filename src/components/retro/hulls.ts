import type { StageKind } from "@/convex/model/retroFormats";
import type { Member, Point, Size } from "./clusters";

/**
 * Proximity hulls (spec §10.3, ADR-0011): the transient shape drawn around
 * cards that happen to sit close together. An affordance for forming a
 * cluster, never a representation of one: a hull has no identity, is
 * derived from positions on every render (so it dissolves when a member
 * moves), ignores cards that already belong to a cluster, and is drawn only
 * while the shared pointer is in a `group` entry.
 */

export interface Hull {
  /** Derived from the sorted member ids; stable while the members stand, no identity beyond. */
  key: string;
  members: string[];
  position: Point;
  width: number;
  height: number;
}

/** How near two card boxes must come, in canvas units, to share a hull. */
export const HULL_GAP = 40;
/** How far the hull is drawn outside its members' boxes. */
export const HULL_PADDING = 16;

interface Box {
  clientId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const near = (a: Box, b: Box, gap: number) =>
  a.left - gap < b.right && b.left - gap < a.right && a.top - gap < b.bottom && b.top - gap < a.bottom;

/** The hulls among the ungrouped cards: every near-connected component of two or more. */
export function proximityHulls(
  cards: readonly Member[],
  size: Size,
  gap = HULL_GAP,
  padding = HULL_PADDING
): Hull[] {
  const boxes: Box[] = cards
    .filter((card) => card.clusterId === undefined)
    .map((card) => ({
      clientId: card.clientId,
      left: card.position.x,
      top: card.position.y,
      right: card.position.x + size.width,
      bottom: card.position.y + size.height,
    }));
  // Union-find over pairs that come near.
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (near(boxes[i], boxes[j], gap)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Box[]>();
  boxes.forEach((box, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), box]);
  });
  const hulls: Hull[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const left = Math.min(...group.map((b) => b.left)) - padding;
    const top = Math.min(...group.map((b) => b.top)) - padding;
    const right = Math.max(...group.map((b) => b.right)) + padding;
    const bottom = Math.max(...group.map((b) => b.bottom)) + padding;
    const members = group.map((b) => b.clientId).sort();
    hulls.push({ key: members.join("+"), members, position: { x: left, y: top }, width: right - left, height: bottom - top });
  }
  return hulls.sort((a, b) => a.key.localeCompare(b.key));
}

/** The hulls the board draws: only in a `group` entry, none anywhere else. */
export function hullsFor(stageKind: StageKind, cards: readonly Member[], size: Size): Hull[] {
  return stageKind === "group" ? proximityHulls(cards, size) : [];
}
