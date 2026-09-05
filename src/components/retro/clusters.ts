/**
 * Cluster geometry (spec §10.3, ADR-0011): a cluster is an identity, not a
 * location, so nothing here is stored. The label chip is anchored at the
 * members' centroid at render time; tidy is the client computing positions
 * around that centroid and calling the one move batch. Pure, so the board
 * derives its chip nodes by memo and a node test proves the layout.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Member {
  clientId: string;
  position: Point;
  clusterId?: string;
}

export interface ClusterChip {
  clusterId: string;
  name: string;
  /** The centroid of the members' centres, in canvas coordinates. */
  position: Point;
  count: number;
}

export function centroidOf(points: readonly Point[]): Point | undefined {
  if (points.length === 0) return undefined;
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

const centreOf = (card: Member, size: Size): Point => ({
  x: card.position.x + size.width / 2,
  y: card.position.y + size.height / 2,
});

/** One chip per cluster that has members, at their centroid; an empty cluster has none. */
export function clusterChips(
  clusters: readonly { _id: string; name: string }[],
  cards: readonly Member[],
  size: Size
): ClusterChip[] {
  const centres = new Map<string, Point[]>();
  for (const card of cards) {
    if (card.clusterId === undefined) continue;
    const list = centres.get(card.clusterId) ?? [];
    list.push(centreOf(card, size));
    centres.set(card.clusterId, list);
  }
  const chips: ClusterChip[] = [];
  for (const cluster of clusters) {
    const points = centres.get(cluster._id);
    const position = points && centroidOf(points);
    if (!position) continue;
    chips.push({ clusterId: cluster._id, name: cluster.name, position, count: points!.length });
  }
  return chips;
}

/**
 * Tidy: the members in reading order (top to bottom, left to right) laid
 * out in a near-square grid whose centre is their current centroid, so the
 * group gathers where it already sits. A lone member stays put.
 */
export function tidyPositions(
  members: readonly Member[],
  size: Size,
  gap = 16
): { clientId: string; position: Point }[] {
  if (members.length <= 1) {
    return members.map((m) => ({ clientId: m.clientId, position: m.position }));
  }
  const centroid = centroidOf(members.map((m) => centreOf(m, size)))!;
  const ordered = [...members].sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x || a.clientId.localeCompare(b.clientId)
  );
  const columns = Math.ceil(Math.sqrt(ordered.length));
  const rows = Math.ceil(ordered.length / columns);
  const totalWidth = columns * size.width + (columns - 1) * gap;
  const totalHeight = rows * size.height + (rows - 1) * gap;
  const originX = centroid.x - totalWidth / 2;
  const originY = centroid.y - totalHeight / 2;
  return ordered.map((m, i) => ({
    clientId: m.clientId,
    position: {
      x: originX + (i % columns) * (size.width + gap),
      y: originY + Math.floor(i / columns) * (size.height + gap),
    },
  }));
}
