/**
 * The Jira adapter's OAuth token operations: the OAuth app's credentials
 * (read and checked here), the code exchange that turns the authorization
 * code the callback hands over into a stored connection, the freshness
 * check, the refresh round-trip (Atlassian rotates refresh tokens, so both
 * are re-encrypted on every refresh), and client construction on top of a
 * valid token. Tokens reach the database only as vault ciphertext and never
 * leave Convex.
 *
 * Lives apart from jira.ts so the provider registry can reach token refresh
 * without importing the adapter's registered actions. Effectful dependencies
 * (fetch, clock, vault key, client credentials) are injectable; production
 * callers use the defaults, tests drive the real code paths with fakes.
 */

import { ConvexError } from "convex/values";
import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import * as TokenVault from "../model/tokenVault";
import { getSiteUrl } from "@/lib/site-config";
import { JiraClient, JiraClientDeps } from "./jiraClient";

/** The Jira OAuth app's credentials, as set on the Convex deployment. */
export interface JiraClientCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * What a deployment without the Jira OAuth app's credentials refuses with.
 * The code is also the OAuth callback's `error=` param, so the person sees
 * the settings page's "not configured" copy while the message, in the logs,
 * names what to set.
 */
export type JiraNotConfigured = { code: "jira_not_configured"; message: string };

/**
 * The Jira OAuth app's credentials, read from the deployment's environment
 * here and nowhere else. The code exchange and token refresh post them, and
 * connect asks for them first, so a missing one refuses the connect instead
 * of failing the refresh sweep 15–60 minutes later.
 */
export function requireJiraClientCredentials(): JiraClientCredentials {
  const clientId = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const missing = [
      ...(clientId ? [] : ["JIRA_CLIENT_ID"]),
      ...(clientSecret ? [] : ["JIRA_CLIENT_SECRET"]),
    ];
    throw new ConvexError<JiraNotConfigured>({
      code: "jira_not_configured",
      message: `Jira is not configured: set ${missing.join(" and ")} on the Convex deployment.`,
    });
  }
  return { clientId, clientSecret };
}

/** Effectful dependencies of the token operations below. */
export interface JiraTokenDeps {
  /** Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Defaults to Date.now. */
  now?: () => number;
  /** Defaults to the TOKEN_ENCRYPTION_KEY env var (via the token vault). */
  keyHex?: string;
  /** Defaults to the JIRA_CLIENT_* env vars (via requireJiraClientCredentials). */
  credentials?: JiraClientCredentials;
}

function resolveDeps(deps: JiraTokenDeps) {
  return {
    fetchImpl: deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args)),
    now: deps.now ?? Date.now,
  };
}

/** What the code exchange hands over: plaintext tokens, never persisted as such. */
export interface JiraOAuthConnection {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
  cloudId: string;
  siteUrl: string;
  providerUserId?: string;
  providerUserEmail?: string;
}

/** Failure reasons map 1:1 onto the OAuth callback's `error=` redirect params. */
export type JiraOAuthExchangeFailure =
  | "jira_token_failed"
  | "jira_resources_failed"
  | "jira_no_site";

export type JiraOAuthExchangeResult =
  | { ok: true; connection: JiraOAuthConnection }
  | { ok: false; error: JiraOAuthExchangeFailure };

export interface JiraOAuthExchangeDeps extends JiraClientCredentials {
  /** The redirect URI the consent URL named; Atlassian checks they match. */
  redirectUri: string;
  /** Defaults to the global fetch; tests inject a fake. */
  fetchImpl?: typeof fetch;
}

function isAtlassianCloudSite(siteUrl: unknown): boolean {
  if (typeof siteUrl !== "string") return false;
  try {
    const url = new URL(siteUrl);
    return url.protocol === "https:" && url.hostname.endsWith(".atlassian.net");
  } catch {
    return false;
  }
}

/**
 * The Jira OAuth code exchange: authorization code → token pair → accessible
 * resources (cloud id + site URL) → best-effort user info.
 */
export async function exchangeJiraCode(
  code: string,
  deps: JiraOAuthExchangeDeps
): Promise<JiraOAuthExchangeResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  // Exchange code for tokens
  const tokenResponse = await fetchImpl(
    "https://auth.atlassian.com/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: deps.clientId,
        client_secret: deps.clientSecret,
        code,
        redirect_uri: deps.redirectUri,
      }),
    }
  );

  if (!tokenResponse.ok) {
    console.error("Jira token exchange failed:", await tokenResponse.text());
    return { ok: false, error: "jira_token_failed" };
  }

  const tokens = await tokenResponse.json();

  // Get accessible resources (Cloud ID)
  const resourcesResponse = await fetchImpl(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );

  if (!resourcesResponse.ok) {
    console.error(
      "Jira resources fetch failed:",
      await resourcesResponse.text()
    );
    return { ok: false, error: "jira_resources_failed" };
  }

  const resources = await resourcesResponse.json();
  const cloudId = resources[0]?.id;
  const siteUrl = resources[0]?.url;

  if (!cloudId) {
    return { ok: false, error: "jira_no_site" };
  }

  // The site is stored and later concatenated into issue browse links
  // rendered as anchor hrefs, so nothing but an Atlassian Cloud site passes.
  if (!isAtlassianCloudSite(siteUrl)) {
    console.error("Jira site is not an https://*.atlassian.net URL:", siteUrl);
    return { ok: false, error: "jira_no_site" };
  }

  // Get Jira user info for metadata (best-effort)
  const jiraUserResponse = await fetchImpl("https://api.atlassian.com/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const jiraUser = jiraUserResponse.ok ? await jiraUserResponse.json() : null;

  return {
    ok: true,
    connection: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scopes: (tokens.scope as string).split(" "),
      cloudId,
      siteUrl,
      providerUserId: jiraUser?.account_id,
      providerUserEmail: jiraUser?.email,
    },
  };
}

/**
 * Where Atlassian sends the person back with the authorization code: the
 * Next.js callback route on this deployment's site (SITE_URL).
 */
function jiraRedirectUri(): string {
  return `${getSiteUrl()}/api/integrations/jira/callback`;
}

/**
 * What a refused Jira connect carries. Like JiraNotConfigured's, each code is
 * also the OAuth callback's `error=` param, so the person sees the settings
 * page's copy for it while the message, in the logs, says what went wrong.
 */
export type JiraConnectRefusal =
  | JiraNotConfigured
  | { code: JiraOAuthExchangeFailure; message: string };

const EXCHANGE_FAILURES: Record<JiraOAuthExchangeFailure, string> = {
  jira_token_failed: "Atlassian refused the authorization code.",
  jira_resources_failed: "Could not read the Jira sites the authorization grants.",
  jira_no_site: "The authorization grants no Atlassian Cloud Jira site.",
};

/**
 * The handshake's last leg, from the authorization code Atlassian handed the
 * callback to the person's stored connection: the code exchange, then the
 * tokens through the token vault, so they reach the database only as
 * ciphertext.
 */
export async function connectJiraWithCode(
  ctx: ActionCtx,
  userId: Id<"users">,
  code: string,
  deps: JiraTokenDeps = {}
): Promise<void> {
  const { fetchImpl, now } = resolveDeps(deps);
  // Asked for before Atlassian is called, and the first token refresh posts
  // them again, so a deployment without them refuses the connect now.
  const credentials = deps.credentials ?? requireJiraClientCredentials();

  const result = await exchangeJiraCode(code, {
    ...credentials,
    redirectUri: jiraRedirectUri(),
    fetchImpl,
  });
  if (!result.ok) {
    throw new ConvexError<JiraConnectRefusal>({
      code: result.error,
      message: EXCHANGE_FAILURES[result.error],
    });
  }
  const { connection } = result;

  const enc = await TokenVault.encryptTokens(
    { accessToken: connection.accessToken, refreshToken: connection.refreshToken },
    deps.keyHex
  );

  await ctx.runMutation(internal.integrations.jira.saveConnection, {
    userId,
    provider: "jira",
    ...enc,
    expiresAt: TokenVault.computeExpiresAt(connection.expiresIn, now()),
    cloudId: connection.cloudId,
    siteUrl: connection.siteUrl,
    providerUserId: connection.providerUserId,
    providerUserEmail: connection.providerUserEmail,
    scopes: connection.scopes,
  });
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
  const { clientId, clientSecret } =
    deps.credentials ?? requireJiraClientCredentials();

  const response = await fetchImpl("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
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
