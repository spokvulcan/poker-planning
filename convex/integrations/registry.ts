/**
 * The provider registry: the one map from a connection's `provider` to that
 * provider's handler. The generic integrations model (model/integrations.ts)
 * and the token-refresh sweep (integrations/tokenRefresh.ts) route through
 * here instead of naming a provider, so a second adapter (GitHub, spec 07)
 * is added by registering a handler — not by editing the generic module.
 *
 * Jira is the only adapter today. The seam is deliberately narrow: a handler
 * is the set of capabilities the generic orchestration actually routes — the
 * webhook reconcile, which decides what happens to a mapping's remote
 * webhook, and token refresh. Anything provider-specific that no generic
 * caller needs (issue import, estimate push) stays inside the adapter.
 *
 * The descriptor holds plain functions from jiraAuth.ts and
 * jiraWebhookReconcile.ts — never an import of jira.ts, which keeps the
 * module graph acyclic: jira.ts → model → here.
 */

import { ActionCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { refreshJiraToken } from "./jiraAuth";
import { jiraWebhookReconcile } from "./jiraWebhookReconcile";

export type IntegrationProvider = Doc<"integrationConnections">["provider"];

/**
 * What the generic integrations module did to a mapping. Each of its callers
 * that changes or ends one hands its own case to the provider's webhook
 * reconcile. A provider's own upkeep of its webhooks (Jira's weekly renewal)
 * stays inside its adapter.
 */
export type MappingChange =
  /** Saved from the room's settings: the row as it was (null when new) and as it is now. */
  | {
      kind: "saved";
      before: Doc<"integrationMappings"> | null;
      after: Doc<"integrationMappings">;
    }
  /**
   * Deleted: removed from the room's settings, its room ended, or swept. The
   * row is gone, so its record comes as data.
   */
  | { kind: "removed"; mapping: Doc<"integrationMappings"> };

/**
 * A provider's webhook reconcile: the one owner of each mapping's remote
 * webhook. It compares the webhook a mapping wants with the one on record and
 * registers, replaces or removes it.
 */
export interface WebhookReconcile {
  reconcile(ctx: MutationCtx, change: MappingChange): Promise<void>;
  /**
   * A connection is going, its mappings (already deleted) with it: removes
   * every webhook they had on record, then the connection row goes. "tail"
   * when a webhook the connection made is live: the provider's disconnect
   * tail deletes the row after deregistering with its credentials. "now" when
   * the caller can delete the row at once.
   */
  disconnect(
    ctx: MutationCtx,
    connectionId: Id<"integrationConnections">,
    mappings: Doc<"integrationMappings">[]
  ): Promise<"now" | "tail">;
}

/** What the generic orchestration routes to a provider. */
export interface IntegrationProviderHandler {
  webhooks: WebhookReconcile;
  /** Refreshes one connection's tokens and returns the fresh access token. */
  refreshConnection(
    ctx: ActionCtx,
    connection: Doc<"integrationConnections">
  ): Promise<string>;
}

const jiraHandler: IntegrationProviderHandler = {
  webhooks: jiraWebhookReconcile,
  refreshConnection: (ctx, connection) => refreshJiraToken(ctx, connection),
};

const handlers = {
  jira: jiraHandler,
} as const;

/** The providers with a registered adapter, in registration order. */
export function registeredProviders(): IntegrationProvider[] {
  return Object.keys(handlers) as IntegrationProvider[];
}

/**
 * The handler for a provider. Throws on a provider with no registered
 * adapter — a silent skip would leak remote webhooks or skip refreshes.
 */
export function getProviderHandler(
  provider: IntegrationProvider
): IntegrationProviderHandler {
  const handler = (handlers as Record<string, IntegrationProviderHandler>)[
    provider
  ];
  if (!handler) {
    throw new Error(
      `No integration handler registered for provider "${provider}"`
    );
  }
  return handler;
}
