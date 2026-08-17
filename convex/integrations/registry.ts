/**
 * The provider registry: the one map from a connection's `provider` to that
 * provider's handler. The generic integrations model (model/integrations.ts)
 * and the token-refresh sweep (integrations/tokenRefresh.ts) route through
 * here instead of naming a provider, so a second adapter (GitHub, spec 07)
 * is added by registering a handler — not by editing the generic module.
 *
 * Jira is the only adapter today. The seam is deliberately narrow: a handler
 * is the set of capabilities the generic orchestration actually routes —
 * webhook registration/deregistration refs, the disconnect tail, the live
 * webhook id accessor, and token refresh. Anything provider-specific that no
 * generic caller needs (issue import, estimate push) stays inside the
 * adapter.
 *
 * The descriptor holds FunctionReferences (via the generated `internal`
 * object) plus plain functions from jiraAuth.ts — never an import of
 * jira.ts, which keeps the module graph acyclic: jira.ts → model → here.
 */

import { FunctionReference } from "convex/server";
import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { refreshJiraToken } from "./jiraAuth";

export type IntegrationProvider = Doc<"integrationConnections">["provider"];

/** What the generic orchestration routes to a provider. */
export interface IntegrationProviderHandler {
  /** (Re-)registers a mapping's remote webhook; scheduled when a mapping save turns on auto-push. */
  registerWebhook: FunctionReference<
    "action",
    "internal",
    { mappingId: Id<"integrationMappings"> }
  >;
  /** Best-effort remote delete of one webhook; retries itself once via `attemptsLeft`. */
  deregisterWebhook: FunctionReference<
    "action",
    "internal",
    {
      connectionId: Id<"integrationConnections">;
      webhookId: string;
      attemptsLeft?: number;
    }
  >;
  /** Disconnect tail: deregisters every live webhook, then deletes the connection row. */
  finalizeDisconnect: FunctionReference<
    "action",
    "internal",
    { connectionId: Id<"integrationConnections">; webhookIds: string[] }
  >;
  /** Reads the live remote webhook id off a mapping row (a provider-specific column). */
  webhookIdOf(mapping: Doc<"integrationMappings">): string | undefined;
  /** Whether a mapping save carries everything webhook registration needs. */
  hasWebhookTarget(args: { projectKey?: string }): boolean;
  /** Refreshes one connection's tokens and returns the fresh access token. */
  refreshConnection(
    ctx: ActionCtx,
    connection: Doc<"integrationConnections">
  ): Promise<string>;
}

const jiraHandler: IntegrationProviderHandler = {
  registerWebhook: internal.integrations.jira.registerWebhook,
  deregisterWebhook: internal.integrations.jira.deregisterWebhook,
  finalizeDisconnect: internal.integrations.jira.finalizeDisconnect,
  webhookIdOf: (mapping) => mapping.jiraWebhookId,
  hasWebhookTarget: (args) => !!args.projectKey,
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
