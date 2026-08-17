/**
 * The token-refresh sweep (cron: refresh-oauth-tokens) and its supporting
 * query. Provider-generic: the sweep walks the provider registry and each
 * connection is refreshed through its provider handler, so no provider is
 * named here.
 */

import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { getProviderHandler, registeredProviders } from "./registry";

/**
 * Connections of one provider whose access token expires before the
 * threshold. Provider filtering uses the by_provider index; the expiry
 * predicate filters in memory (expiresAt has no index — the provider subset
 * is small).
 */
export const getExpiringConnections = internalQuery({
  args: {
    provider: v.union(v.literal("jira"), v.literal("github")),
    expiryThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("integrationConnections")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .collect();

    return connections.filter((c) => c.expiresAt < args.expiryThreshold);
  },
});

/**
 * Refreshes every connection whose token expires in the next 45 minutes,
 * iterating the provider registry: each provider's expiring connections are
 * refreshed through its handler. One connection's failure is logged and
 * never blocks the rest.
 */
export const refreshExpiringTokens = internalAction({
  args: {},
  handler: async (ctx) => {
    const threshold = Date.now() + 45 * 60 * 1000;

    for (const provider of registeredProviders()) {
      const handler = getProviderHandler(provider);
      const connections: Doc<"integrationConnections">[] = await ctx.runQuery(
        internal.integrations.tokenRefresh.getExpiringConnections,
        { provider, expiryThreshold: threshold }
      );

      console.log(
        `Found ${connections.length} ${provider} tokens to refresh`
      );

      for (const connection of connections) {
        try {
          await handler.refreshConnection(ctx, connection);
          console.log(
            `Refreshed token for ${provider} connection ${connection._id}`
          );
        } catch (error) {
          console.error(
            `Failed to refresh token for ${provider} connection ${connection._id}:`,
            error
          );
        }
      }
    }
  },
});
