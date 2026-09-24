import { v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import { requireAuth } from "./model/auth";
import { recentGifUsage, recordGifSearch } from "./model/gifUsage";

/**
 * Counts one GIF search. Called by the Next.js GIF route after it answers,
 * as the signed-in person who searched (guests included).
 */
export const record = mutation({
  args: { rateLimited: v.boolean() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await recordGifSearch(ctx, args.rateLimited);
  },
});

/**
 * GIF search traffic by hour, newest first: how close the app runs to
 * GIPHY's hourly limit, and the hours it hit it.
 *
 *   npx convex run gifUsage:recent --prod
 */
export const recent = internalQuery({
  args: { hours: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const hours = Number.isFinite(args.hours) ? Math.floor(args.hours!) : 48;
    return await recentGifUsage(ctx, Math.min(Math.max(hours, 1), 24 * 90));
  },
});
