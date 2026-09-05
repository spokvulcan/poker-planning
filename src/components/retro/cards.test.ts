/**
 * The board and mine merge (spec §9, §10.9): `retro.board` carries every
 * card as a silhouette or in full, `retro.mine` carries the viewer's own in
 * full; the client merges them, and `hidden` is true iff the viewer has no
 * text for the card after the merge.
 */
import { describe, it, expect } from "vitest";
import { mergeCards, placeNewCard } from "./cards";
import type { ProjectedCard, FullCard } from "@/convex/model/retro";
import type { Id } from "@/convex/_generated/dataModel";

const me = "u-me" as Id<"users">;
const other = "u-other" as Id<"users">;
const pos = { x: 1, y: 2 };

const silhouette = (clientId: string): ProjectedCard =>
  ({ _id: `id-${clientId}` as Id<"retroCards">, clientId, position: pos, promptId: "p1" });
const full = (clientId: string, authorId: Id<"users">, text = clientId): FullCard => ({
  ...silhouette(clientId),
  text,
  authorId,
  createdAt: 1,
  updatedAt: 1,
  committedAt: 1,
});

describe("mergeCards", () => {
  it("in a hidden entry: own silhouettes take their text from mine, others stay hidden", () => {
    const merged = mergeCards([silhouette("a"), silhouette("b")], [full("a", me, "my text")], me);
    expect(merged.map((c) => [c.clientId, c.hidden, c.text, c.own])).toEqual([
      ["a", false, "my text", true],
      ["b", true, undefined, false],
    ]);
  });

  it("in a visible entry: every card is readable and own is by author", () => {
    const merged = mergeCards([full("a", me), full("b", other)], [full("a", me)], me);
    expect(merged.map((c) => [c.clientId, c.hidden, c.own, c.authorId])).toEqual([
      ["a", false, true, me],
      ["b", false, false, other],
    ]);
  });

  it("keeps the board's order and position, and tolerates mine still loading", () => {
    const moved = { ...silhouette("a"), position: { x: 50, y: 60 } };
    const merged = mergeCards([silhouette("b"), moved], undefined, me);
    expect(merged.map((c) => c.clientId)).toEqual(["b", "a"]);
    expect(merged[1].position).toEqual({ x: 50, y: 60 });
    expect(merged[1].hidden).toBe(true);
  });
});

describe("placeNewCard", () => {
  it("lands inside the prompt's zone and staggers by how many cards it already holds", () => {
    const zone = { x: 100, y: 200, width: 480, height: 640 };
    const first = placeNewCard(zone, 0);
    const second = placeNewCard(zone, 1);
    for (const p of [first, second, placeNewCard(zone, 7)]) {
      expect(p.x).toBeGreaterThanOrEqual(zone.x);
      expect(p.x).toBeLessThan(zone.x + zone.width);
      expect(p.y).toBeGreaterThanOrEqual(zone.y);
      expect(p.y).toBeLessThan(zone.y + zone.height);
    }
    expect(first).not.toEqual(second);
  });
});
