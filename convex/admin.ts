/**
 * Admin operations for database maintenance.
 * These functions are internal-only and require explicit confirmation.
 */

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ROOM_OWNED_TABLES } from "./model/roomAggregate";

const DELETE_CONFIRMATION = "I understand this will delete all data permanently";

/**
 * Permanently deletes ALL data from the database.
 *
 * Tables affected: every room-owned table from the one inventory
 * (convex/model/roomAggregate.ts — issues, roomMemberships, votes,
 * canvasNodes, votingTimestamps, individualVotes, integrationMappings)
 * plus issueLinks (room-owned via its issue), rooms, and the user-scoped /
 * global tables (users, integrationConnections, webhookEvents).
 *
 * This action cannot be undone.
 *
 * @example
 * // Local
 * npx convex run admin:dangerouslyDeleteAllData \
 *   '{"confirm": "I understand this will delete all data permanently"}'
 *
 * // Production
 * npx convex run --prod admin:dangerouslyDeleteAllData \
 *   '{"confirm": "I understand this will delete all data permanently"}'
 */
export const dangerouslyDeleteAllData = internalMutation({
  args: {
    confirm: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.confirm !== DELETE_CONFIRMATION) {
      throw new Error(
        `Safety check failed. Pass confirm: "${DELETE_CONFIRMATION}"`
      );
    }

    // Room-owned tables come from the one inventory; issueLinks are room-owned
    // through their issues. The rest are user-scoped or global — this wipe's
    // own concern, not the inventory's.
    const tables = [
      ...ROOM_OWNED_TABLES,
      "issueLinks",
      "integrationConnections",
      "webhookEvents",
      "rooms",
      "users",
    ] as const;

    const results: Record<string, number> = {};

    for (const table of tables) {
      let count = 0;
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
        count++;
      }
      results[table] = count;
    }

    console.log("All data deleted:", results);

    return results;
  },
});
