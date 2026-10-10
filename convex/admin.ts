/**
 * Admin operations for database maintenance.
 * These functions are internal-only and require explicit confirmation.
 */

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import * as Integrations from "./model/integrations";
import * as RoomEnding from "./model/roomEnding";

const DELETE_CONFIRMATION = "I understand this will delete all data permanently";

/**
 * Permanently deletes ALL data from the database.
 *
 * Every room ends the way any room does (convex/model/roomEnding.ts), in
 * steps of its own that finish shortly after this returns: everything it
 * owns goes, its mappings' webhooks are removed and its presence is cleared.
 * A sweep follows, for what rooms deleted some other way left behind. Every
 * integration connection disconnects, so the webhooks it made are removed
 * with its credentials before its row goes. The rest is global or names
 * people, and goes here: users, webhookEvents, gifSearchUsage.
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

    const rooms = await ctx.db.query("rooms").collect();
    for (const room of rooms) {
      await RoomEnding.endRoom(ctx, room._id);
    }
    // A sweep finishes what rooms deleted some other way left behind.
    await RoomEnding.endStaleRooms(ctx);

    const connections = await ctx.db.query("integrationConnections").collect();
    for (const connection of connections) {
      await Integrations.disconnectConnection(ctx, connection._id);
    }

    const results: Record<string, number> = {
      roomsEnding: rooms.length,
      connectionsDisconnecting: connections.length,
    };
    for (const table of ["users", "webhookEvents", "gifSearchUsage"] as const) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(table, doc._id);
      }
      results[table] = docs.length;
    }

    console.log("All data deleted:", results);

    return results;
  },
});
