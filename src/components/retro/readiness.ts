import type { RoomUserData } from "@/convex/model/users";
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
}

/** What `presence.list` returns per person; `data` is the readiness payload when set. */
export interface PresenceEntry {
  userId: string;
  online: boolean;
  lastDisconnected: number;
  data?: unknown;
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
 * The roster: every member with presence and readiness merged on, in the
 * one ordering rule (online first, then by join time).
 */
export function projectRoster(
  users: readonly RoomUserData[],
  presence: readonly PresenceEntry[] | undefined,
  currentStageId: string
): RosterRow[] {
  const byUserId = new Map((presence ?? []).map((entry) => [entry.userId, entry]));
  const rows: RosterRow[] = users.map((user) => {
    const entry = byUserId.get(user._id);
    const online = entry?.online ?? false;
    return {
      ...user,
      isOnline: online,
      lastSeen: online ? null : (entry?.lastDisconnected ?? null),
      ready: readinessOf(entry?.data, currentStageId),
    };
  });
  return orderUsersByPresence(rows) as RosterRow[];
}
