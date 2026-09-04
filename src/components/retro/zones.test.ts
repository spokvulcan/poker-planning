/**
 * Prompt soft zones (ADR-0011, ADR-0021): the board draws one zone per
 * prompt from the stamped format, in prompt order, wrapping into rows.
 */
import { describe, it, expect } from "vitest";
import { layoutZones, ZONE_WIDTH, ZONE_HEIGHT, ZONE_GAP, ZONES_PER_ROW } from "./zones";

const prompt = (id: string, order: number) => ({ id, label: id, color: "green", order });

describe("layoutZones", () => {
  it("lays prompts out left to right in prompt order, not array order", () => {
    const zones = layoutZones([prompt("b", 1), prompt("a", 0), prompt("c", 2)]);
    expect(zones.map((z) => z.promptId)).toEqual(["a", "b", "c"]);
    expect(zones.map((z) => z.x)).toEqual([0, ZONE_WIDTH + ZONE_GAP, 2 * (ZONE_WIDTH + ZONE_GAP)]);
    expect(zones.every((z) => z.y === 0)).toBe(true);
    expect(zones[0]).toMatchObject({ width: ZONE_WIDTH, height: ZONE_HEIGHT });
  });

  it("wraps into a second row after ZONES_PER_ROW", () => {
    const prompts = Array.from({ length: ZONES_PER_ROW + 1 }, (_, i) => prompt(`p${i}`, i));
    const zones = layoutZones(prompts);
    expect(zones[ZONES_PER_ROW]).toMatchObject({ x: 0, y: ZONE_HEIGHT + ZONE_GAP });
  });

  it("returns nothing for a format with no prompts", () => {
    expect(layoutZones([])).toEqual([]);
  });
});
