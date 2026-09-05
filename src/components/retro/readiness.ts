import { orderUsersByPresence, type UserWithPresence } from "@/hooks/useRoomPresence";

/**
 * Readiness (ADR-0010, spec §7): a person's "I am done with this stage"
 * signal, held in the presence payload as `{ stageId, ready }` and shown
 * named per person, never summed. The projection is the whole clearing
 * mechanism: a payload keyed to any entry but the current one is absent, so
 * an advance clears every signal without a write. Pure, so a jsdom test
 * proves it without the presence component.
 */
export interface ReadinessPayload {
  stageId: string;
  ready: boolean;
  /** The `clientId` of the card the person is typing into (ADR-0022). */
  editing?: string;
}

/** The card a person is editing, from their payload; undefined when none. */
export function editingOf(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const editing = (data as { editing?: unknown }).editing;
  return typeof editing === "string" ? editing : undefined;
}

function isReadinessPayload(data: unknown): data is ReadinessPayload {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as ReadinessPayload).stageId === "string" &&
    typeof (data as ReadinessPayload).ready === "boolean"
  );
}

/** Ready iff the payload is keyed to the current entry and says so. */
export function readinessOf(data: unknown, currentStageId: string): boolean {
  return isReadinessPayload(data) && data.stageId === currentStageId && data.ready;
}

/** One roster row: the member, their presence and their readiness for the current entry. */
export interface RosterRow extends UserWithPresence {
  ready: boolean;
}

/**
 * The roster: every member (presence already merged by `useRoomPresence`)
 * with readiness read from their payload, in the one ordering rule (online
 * first, then by join time).
 */
export function projectRoster(users: readonly UserWithPresence[], currentStageId: string): RosterRow[] {
  const rows = users.map((user) => ({ ...user, ready: readinessOf(user.data, currentStageId) }));
  return orderUsersByPresence(rows) as RosterRow[];
}
