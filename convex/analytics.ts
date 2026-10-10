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

// Get summary stats for dashboard header
export const getSummary = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getDashboardSummary(
      ctx,
      user,
      args.dateRange
    );
  },
});

// Get session history list
export const getSessions = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getUserSessions(
      ctx,
      user,
      args.dateRange
    );
  },
});

// Get agreement trend data for line chart
export const getAgreementTrend = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getAgreementTrend(
      ctx,
      user,
      args.dateRange
    );
  },
});

// Get velocity stats for bar chart
export const getVelocityStats = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getVelocityStats(
      ctx,
      user,
      args.dateRange
    );
  },
});

// Get vote distribution for histogram
export const getVoteDistribution = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getVoteDistribution(
      ctx,
      user,
      args.dateRange
    );
  },
});

// Get time-to-consensus statistics
export const getTimeToConsensus = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getTimeToConsensusStats(
      ctx,
      user,
      args.dateRange
    );
  },
});

// Get participation statistics
export const getParticipationStats = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getParticipationStats(
      ctx,
      user,
      args.dateRange
    );
  },
});

// Get predictability score and session breakdown
export const getPredictability = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getPredictabilityScore(
      ctx,
      user,
      args.dateRange
    );
  },
});

// Get voter alignment data (scatter plot + stats table)
export const getVoterAlignment = query({
  args: {
    dateRange: dateRangeValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCaller(ctx);
    return await Analytics.getVoterAlignment(
      ctx,
      user,
      args.dateRange
    );
  },
});
