import { format } from "date-fns";
import type { ActionRead } from "@/convex/model/retroActions";
import { parseCollectUntil } from "./collect-until";

/**
 * The action item's rendering arithmetic (spec §13, ADR-0017), pure so the
 * row, the panel and a node test share one rule.
 */

/** Overdue is a rendering state, not a status: `dueAt` past and still `open`. */
export function isOverdue(item: Pick<ActionRead, "status" | "dueAt">, now: number): boolean {
  return item.status === "open" && item.dueAt !== undefined && item.dueAt < now;
}

/** The close panel's facts (spec §19): how many, and how many unowned. Counts, never a judgement. */
export function factsOf(items: readonly Pick<ActionRead, "ownerId">[]): { count: number; unowned: number } {
  return {
    count: items.length,
    unowned: items.filter((item) => item.ownerId === undefined).length,
  };
}

/** A due date as the `<input type="date">` holds it. */
export function toDateInput(ms: number | undefined): string {
  return ms === undefined ? "" : format(ms, "yyyy-MM-dd");
}

/** The date field's value as the end of that local day, the one reading the collect date uses too. */
export const parseDueDate = parseCollectUntil;

/** A due date as the row shows it. */
export const formatDue = (ms: number) => format(ms, "d MMM");
