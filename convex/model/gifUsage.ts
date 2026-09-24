import { MutationCtx, QueryCtx } from "../_generated/server";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Counts one GIF search against the current hour, and whether GIPHY refused
 * it for its hourly rate limit.
 */
export async function recordGifSearch(ctx: MutationCtx, rateLimited: boolean): Promise<void> {
  const hour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const row = await ctx.db
    .query("gifSearchUsage")
    .withIndex("by_hour", (q) => q.eq("hour", hour))
    .unique();
  if (row) {
    await ctx.db.patch("gifSearchUsage", row._id, {
      requests: row.requests + 1,
      rateLimited: row.rateLimited + (rateLimited ? 1 : 0),
    });
  } else {
    await ctx.db.insert("gifSearchUsage", { hour, requests: 1, rateLimited: rateLimited ? 1 : 0 });
  }
}

export interface GifUsageHour {
  /** The hour's start, as an ISO time (UTC). */
  hour: string;
  requests: number;
  rateLimited: number;
}

/** The latest hours with any GIF search, newest first. */
export async function recentGifUsage(ctx: QueryCtx, hours: number): Promise<GifUsageHour[]> {
  const rows = await ctx.db.query("gifSearchUsage").withIndex("by_hour").order("desc").take(hours);
  return rows.map((row) => ({
    hour: new Date(row.hour).toISOString(),
    requests: row.requests,
    rateLimited: row.rateLimited,
  }));
}
