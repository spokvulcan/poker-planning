import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, STAGE_PILL_LABEL } from "@/convex/retroCopy";
import type { StageKind } from "@/convex/model/retroFormats";

/**
 * The stage pill (spec §7): the one place the board says which stage is
 * shared. Shows the shared pointer's kind; the advisory timebox countdown
 * joins it with the stages ticket.
 */
export function StagePill({ kind }: { kind: StageKind }) {
  return (
    <Badge
      variant="secondary"
      data-testid="stage-pill"
      data-stage={kind}
      aria-label={`${STAGE_PILL_LABEL}: ${STAGE_LABELS[kind]}`}
      className="h-7 px-3 text-sm"
    >
      {STAGE_LABELS[kind]}
    </Badge>
  );
}
