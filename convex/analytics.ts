import { query } from "./_generated/server";
import { v } from "convex/values";
import * as Analytics from "./model/analytics";
import { requireCaller } from "./model/caller";

const dateRangeValidator = v.optional(
  v.object({
    from: v.number(),
    to: v.number(),
  })
);

// Every panel of the dashboard Overview, from one read of the viewer's history
export const getDashboard = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getDashboard(ctx, user, args.dateRange);
  },
});

// The Overview's session list on its own, for the Sessions page
export const getSessions = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getUserSessions(ctx, user, args.dateRange);
  },
});
