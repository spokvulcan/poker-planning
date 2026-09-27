import { describe, it, expect } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { freshHeights } from "./sticky-heights";

// The author's browser records how tall it draws its own stickies, for the
// reveal to make room for them (ADR-0027): only fresh measurements of a face.

const a = "a" as Id<"retroStickies">;

describe("freshHeights", () => {
  it("records a sticky's height once, and again only when it changes", () => {
    const seen = new Map<string, number>();
    const sent = new Map<string, number>();

    expect(freshHeights([{ stickyId: a, height: 124, open: false }], seen, sent)).toEqual([{ stickyId: a, height: 124 }]);
    expect(freshHeights([{ stickyId: a, height: 124, open: false }], seen, sent)).toEqual([]);
    expect(freshHeights([{ stickyId: a, height: 200, open: false }], seen, sent)).toEqual([{ stickyId: a, height: 200 }]);
  });

  it("skips the editor's height, and the stale one React Flow holds right after the editor closes", () => {
    const seen = new Map<string, number>();
    const sent = new Map<string, number>([[a, 124]]);

    expect(freshHeights([{ stickyId: a, height: 300, open: true }], seen, sent)).toEqual([]);
    // Closed, but not yet re-measured: still the editor's 300.
    expect(freshHeights([{ stickyId: a, height: 300, open: false }], seen, sent)).toEqual([]);
    // Re-measured as a face.
    expect(freshHeights([{ stickyId: a, height: 160, open: false }], seen, sent)).toEqual([{ stickyId: a, height: 160 }]);
  });

  it("waits for a measurement", () => {
    expect(freshHeights([{ stickyId: a, height: 0, open: false }], new Map(), new Map())).toEqual([]);
  });
});
