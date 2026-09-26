import { describe, it, expect } from "vitest";
import { dropTargetAt } from "./drop-target";

describe("dropTargetAt", () => {
  const target = { id: "t", box: { x: 100, y: 100, width: 200, height: 100 } };

  it("finds the node whose box holds the dragged node's centre", () => {
    expect(dropTargetAt({ x: 150, y: 120, width: 100, height: 40 }, [target])).toBe(target);
  });

  it("finds nothing when only an edge overlaps", () => {
    expect(dropTargetAt({ x: 250, y: 180, width: 200, height: 100 }, [target])).toBeUndefined();
  });
});
