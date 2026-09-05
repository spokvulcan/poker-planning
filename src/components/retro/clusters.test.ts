/**
 * Cluster geometry (spec §10.3, ADR-0011): the label chip sits at the
 * members' centroid at render time and is never stored; tidy is the client
 * laying members out around that centroid as one move batch.
 */
import { describe, it, expect } from "vitest";
import { centroidOf, clusterChips, tidyPositions } from "./clusters";
import { nextGroupName } from "@/convex/retroCopy";

const size = { width: 200, height: 100 };
const card = (clientId: string, x: number, y: number, clusterId?: string) => ({
  clientId,
  position: { x, y },
  ...(clusterId ? { clusterId } : {}),
});

describe("centroidOf", () => {
  it("is the mean of the points, and undefined for none", () => {
    expect(centroidOf([])).toBeUndefined();
    expect(centroidOf([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
  });
});

describe("clusterChips", () => {
  it("anchors each chip at the centroid of its members' centres and counts them; an empty cluster has no chip", () => {
    const clusters = [
      { _id: "k1", name: "Group 1" },
      { _id: "k2", name: "Group 2" },
    ];
    const cards = [card("a", 0, 0, "k1"), card("b", 400, 200, "k1"), card("c", 900, 900)];
    expect(clusterChips(clusters, cards, size)).toEqual([
      { clusterId: "k1", name: "Group 1", position: { x: 300, y: 150 }, count: 2 },
    ]);
  });
});

describe("tidyPositions", () => {
  it("lays members out in a near-square grid centred on their centroid, keeping their reading order", () => {
    const members = [card("c", 500, 0), card("a", 0, 0), card("b", 250, 0), card("d", 0, 300)];
    const moves = tidyPositions(members, size, 20);
    // Four members → two columns, two rows; a 420 × 220 grid around the
    // centroid of the members' centres, (287.5, 125).
    expect(moves.map((m) => m.clientId)).toEqual(["a", "b", "c", "d"]);
    expect(moves.map((m) => m.position)).toEqual([
      { x: 77.5, y: 15 },
      { x: 297.5, y: 15 },
      { x: 77.5, y: 135 },
      { x: 297.5, y: 135 },
    ]);
  });

  it("reads a measured height over the level's: the chip centres on the real box, and a tidy row is as tall as its tallest member", () => {
    const tall = { ...card("a", 0, 0, "k1"), height: 300 };
    const short = card("b", 400, 0, "k1");
    // Centres (100, 150) and (500, 50) → centroid (300, 100), not (300, 50).
    expect(clusterChips([{ _id: "k1", name: "Group 1" }], [tall, short], size)[0].position).toEqual({ x: 300, y: 100 });
    const moves = tidyPositions([tall, short, card("c", 0, 600), card("d", 400, 600)], size, 20);
    // Row one is 300 tall, row two 100: a 420 × 420 grid around the centroid of the centres, (300, 375).
    expect(moves.map((m) => m.position)).toEqual([
      { x: 90, y: 165 },
      { x: 310, y: 165 },
      { x: 90, y: 485 },
      { x: 310, y: 485 },
    ]);
  });

  it("a single member is left where it is", () => {
    expect(tidyPositions([card("a", 40, 50)], size)).toEqual([{ clientId: "a", position: { x: 40, y: 50 } }]);
  });
});

describe("nextGroupName", () => {
  it("counts past the highest Group {n} and past the row count, whichever is larger", () => {
    expect(nextGroupName([])).toBe("Group 1");
    expect(nextGroupName([{ name: "Group 2" }])).toBe("Group 3");
    expect(nextGroupName([{ name: "Demo" }, { name: "Group 1" }])).toBe("Group 3");
  });
});
