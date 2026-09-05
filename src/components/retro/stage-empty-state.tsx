import { STAGE_EMPTY, STAGE_LABELS } from "@/convex/retroCopy";
import type { StageKind } from "@/convex/model/retroFormats";

/** The kinds whose line is about cards; the others speak of action items. */
const CARD_KINDS: ReadonlySet<StageKind> = new Set(["collect", "group", "vote", "discuss"]);

/**
 * Whether the viewed entry has nothing in it (spec §7): no cards for a
 * card stage; for `review` and `close` the line is about action items,
 * which arrive with their own ticket, so until then those entries always
 * read empty.
 */
export function isStageEmpty(kind: StageKind, cardCount: number): boolean {
  return CARD_KINDS.has(kind) ? cardCount === 0 : true;
}

/**
 * A stage with nothing in it (ADR-0010): an explanation over the canvas,
 * never a lock.
 */
export function StageEmptyState({ kind }: { kind: StageKind }) {
  return (
    <div
      data-testid="stage-empty-state"
      data-kind={kind}
      className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4"
    >
      <p className="rounded-lg border bg-white/90 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur dark:bg-surface-2/90">
        <span className="font-medium text-foreground">{STAGE_LABELS[kind]}.</span> {STAGE_EMPTY[kind]}
      </p>
    </div>
  );
}
