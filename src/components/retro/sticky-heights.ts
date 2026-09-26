import type { Id } from "@/convex/_generated/dataModel";

/** One of the viewer's stickies as React Flow last measured it. */
export interface MeasuredSticky {
  stickyId: Id<"retroStickies">;
  height: number;
  /** Open in the editor, or open as a stack: its measured height isn't its face's. */
  open: boolean;
}

/**
 * Which of the viewer's sticky heights to record for the reveal (ADR-0027):
 * only a fresh measurement, of a sticky drawn as its face, that differs from
 * what was last sent. Right after an edit or an open stack closes, React Flow
 * still holds the editor's or the stack's height, and that one was seen while
 * it was open, so it isn't fresh. `seen` and `sent` carry over between calls.
 */
export function freshHeights(
  measured: readonly MeasuredSticky[],
  seen: Map<string, number>,
  sent: Map<string, number>
): { stickyId: Id<"retroStickies">; height: number }[] {
  const fresh: { stickyId: Id<"retroStickies">; height: number }[] = [];
  for (const { stickyId, height, open } of measured) {
    if (!height || seen.get(stickyId) === height) continue;
    seen.set(stickyId, height);
    if (open || sent.get(stickyId) === height) continue;
    sent.set(stickyId, height);
    fresh.push({ stickyId, height });
  }
  return fresh;
}
