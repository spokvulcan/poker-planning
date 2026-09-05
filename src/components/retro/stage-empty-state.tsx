import { STAGE_EMPTY, STAGE_LABELS } from "@/convex/retroCopy";
import type { StageKind } from "@/convex/model/retroFormats";

/**
 * A stage with nothing in it (ADR-0010): an explanation over the canvas,
 * never a lock. The cards ticket conditions it on the board being empty
 * for the viewed entry; until then every entry reads its line.
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
