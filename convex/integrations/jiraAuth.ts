/**
 * The Jira adapter's OAuth token operations: the freshness check, the refresh
 * round-trip (Atlassian rotates refresh tokens, so both are re-encrypted on
 * every refresh), and client construction on top of a valid token.
 *
 * Lives apart from jira.ts so the provider registry can reach token refresh
 * without importing the adapter's registered actions. Effectful dependencies
 * (fetch, clock, vault key) are injectable; production callers use the
 * defaults, tests drive the real code paths with fakes.
 */

import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc } from "../_generated/dataModel";
import * as TokenVault from "../model/tokenVault";
import { JiraClient, JiraClientDeps } from "./jiraClient";

/** Effectful dependencies of the token operations below. */
export interface JiraTokenDeps {
  /** Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Defaults to Date.now. */
  now?: () => number;
  /** Defaults to the TOKEN_ENCRYPTION_KEY env var (via the token vault). */
  keyHex?: string;
}

function resolveDeps(deps: JiraTokenDeps) {
  return {
    fetchImpl: deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args)),
    now: deps.now ?? Date.now,
  };
}

/**
 * Decrypts the stored access token while it is fresh (the vault's 60-second
 * buffer rule); otherwise refreshes it first.
 */
export async function getValidAccessToken(
  ctx: ActionCtx,
  connection: Doc<"integrationConnections">,
  deps: JiraTokenDeps = {}
): Promise<string> {
  if (TokenVault.isAccessTokenFresh(connection.expiresAt, deps.now?.() ?? Date.now())) {
    return TokenVault.decryptAccessToken(connection, deps.keyHex);
  }
  return refreshJiraToken(ctx, connection, deps);
}

/**
 * Exchanges the refresh token for a new token pair and persists both through
 * the token vault; `expiresAt` comes from the vault's single computeExpiresAt.
 */
export async function refreshJiraToken(
  ctx: ActionCtx,
  connection: Doc<"integrationConnections">,
  deps: JiraTokenDeps = {}
): Promise<string> {
  const { fetchImpl, now } = resolveDeps(deps);
  const refreshToken = await TokenVault.decryptRefreshToken(connection, deps.keyHex);

  const response = await fetchImpl("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Jira token: ${response.status} ${errorText}`);
  }

  const tokens = await response.json();

  // Atlassian uses rotating refresh tokens — encrypt both new tokens.
  const enc = await TokenVault.encryptTokens(
    {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    },
    deps.keyHex
  );

  await ctx.runMutation(internal.integrations.jira.updateTokens, {
    connectionId: connection._id,
    ...enc,
    expiresAt: TokenVault.computeExpiresAt(tokens.expires_in, now()),
  });

  return tokens.access_token;
}

/** Builds a JiraClient on a valid (freshly refreshed when needed) token. */
export async function buildJiraClient(
  ctx: ActionCtx,
  connection: Doc<"integrationConnections">,
  deps: JiraTokenDeps & { clientDeps?: JiraClientDeps } = {}
): Promise<JiraClient> {
  if (!connection.cloudId) {
    throw new Error("Jira connection missing cloudId");
  }
  const accessToken = await getValidAccessToken(ctx, connection, deps);
  return new JiraClient(connection.cloudId, accessToken, deps.clientDeps);
}
