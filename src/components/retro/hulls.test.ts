/**
 * Proximity hulls (spec §10.3, ADR-0011): drawn only in `group`, from
 * near-connected ungrouped cards, with no identity beyond their members;
 * a member moving away dissolves the hull.
 */
import { describe, it, expect } from "vitest";
import { hullsFor, proximityHulls } from "./hulls";

const size = { width: 200, height: 100 };
const card = (clientId: string, x: number, y: number, clusterId?: string) => ({
  clientId,
  position: { x, y },
  ...(clusterId ? { clusterId } : {}),
});

describe("proximityHulls", () => {
  it("joins cards whose boxes come within the gap into one hull, padded around their bounds", () => {
    const hulls = proximityHulls([card("a", 0, 0), card("b", 230, 10), card("c", 900, 900)], size, 40, 16);
    expect(hulls).toEqual([
      { key: "a+b", members: ["a", "b"], position: { x: -16, y: -16 }, width: 462, height: 142 },
    ]);
  });

  it("chains through a middle card, and dissolves when a member moves away", () => {
    const chain = [card("a", 0, 0), card("b", 220, 0), card("c", 440, 0)];
    expect(proximityHulls(chain, size).map((h) => h.members)).toEqual([["a", "b", "c"]]);
    const moved = [card("a", 0, 0), card("b", 220, 0), card("c", 800, 0)];
    expect(proximityHulls(moved, size).map((h) => h.members)).toEqual([["a", "b"]]);
  });

  it("ignores cards that already belong to a cluster", () => {
    expect(proximityHulls([card("a", 0, 0, "k1"), card("b", 210, 0)], size)).toEqual([]);
    expect(proximityHulls([card("a", 0, 0, "k1"), card("b", 210, 0, "k1")], size)).toEqual([]);
  });
});

describe("hullsFor", () => {
  it("draws hulls only while the shared pointer is in group", () => {
    const cards = [card("a", 0, 0), card("b", 210, 0)];
    expect(hullsFor("group", cards, size)).toHaveLength(1);
    for (const kind of ["collect", "review", "vote", "discuss", "close"] as const) {
      expect(hullsFor(kind, cards, size)).toEqual([]);
    }
  });
});
