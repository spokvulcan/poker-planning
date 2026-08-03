import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

/**
 * The one inventory of what a room owns (derived from schema.ts).
 *
 * Every table keyed by `roomId` is a direct member. `issueLinks` is owned
 * transitively through its issue — it has no `roomId` of its own — so the
 * cascade expands it from the room's issues instead.
 *
 * Deliberately NOT room-owned: `integrationConnections` belongs to users,
 * `webhookEvents` is a global dedup table, and `users` is global identity.
 * There is no per-room presence/timer table — presence is connection-local
 * and canvas timers are `canvasNodes` rows.
 */
export const ROOM_OWNED_TABLES = [
  "issues",
  "roomMemberships",
  "votes",
  "canvasNodes",
  "votingTimestamps",
  "individualVotes",
  "integrationMappings",
] as const;

export type RoomOwnedTable = (typeof ROOM_OWNED_TABLES)[number];

/**
 * Deletes a room and everything it owns, per ROOM_OWNED_TABLES.
 * Returns per-table deletion counts (including `issueLinks` and `rooms`).
 */
export async function deleteRoomAggregate(
  ctx: MutationCtx,
  roomId: Id<"rooms">
): Promise<Record<RoomOwnedTable | "issueLinks" | "rooms", number>> {
  // Collect every row the room owns, per inventory table, in parallel.
  const rowsByTable = await Promise.all(
    ROOM_OWNED_TABLES.map(async (table) => ({
      table,
      rows: await ctx.db
        .query(table)
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect(),
    }))
  );

  // issueLinks are room-owned through their issue: expand from this room's issues.
  const issueRows = rowsByTable.find((entry) => entry.table === "issues")!
    .rows as Doc<"issues">[];
  const issueLinks = (
    await Promise.all(
      issueRows.map((issue) =>
        ctx.db
          .query("issueLinks")
          .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
          .collect()
      )
    )
  ).flat();

  const deletions: Promise<void>[] = [];
  for (const { rows } of rowsByTable) {
    deletions.push(...rows.map((row) => ctx.db.delete(row._id)));
  }
  deletions.push(...issueLinks.map((link) => ctx.db.delete(link._id)));
  await Promise.all(deletions);

  // Delete the room itself last.
  await ctx.db.delete(roomId);

  const deleted = {} as Record<RoomOwnedTable | "issueLinks" | "rooms", number>;
  for (const { table, rows } of rowsByTable) {
    deleted[table] = rows.length;
  }
  deleted.issueLinks = issueLinks.length;
  deleted.rooms = 1;
  return deleted;
}
