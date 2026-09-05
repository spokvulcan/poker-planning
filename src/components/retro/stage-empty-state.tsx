import { STAGE_EMPTY, STAGE_LABELS, type CardStageKind } from "@/convex/retroCopy";
import type { StageKind } from "@/convex/model/retroFormats";

const isCardStage = (kind: StageKind): kind is CardStageKind => kind in STAGE_EMPTY;

/**
 * The card stage the viewed entry is empty in (spec §7): a card stage with
 * no cards. `review` and `close` never read empty here: their panels carry
 * the register's line for no action items (spec §13).
 */
export function emptyStageOf(kind: StageKind, cardCount: number): CardStageKind | undefined {
  return isCardStage(kind) && cardCount === 0 ? kind : undefined;
}

/**
 * A stage with nothing in it (ADR-0010): an explanation over the canvas,
 * never a lock.
 */
export function StageEmptyState({ kind }: { kind: CardStageKind }) {
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
