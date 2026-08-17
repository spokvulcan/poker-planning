/**
 * The Jira OAuth code exchange: authorization code → token pair → accessible
 * resources (cloud id + site URL) → best-effort user info. Extracted from the
 * callback route as a plain function with an injectable fetch so the whole
 * exchange is unit-testable; the route keeps only CSRF state verification,
 * env plumbing, and redirect mapping.
 */

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

/** Failure reasons map 1:1 onto the route's `error=` redirect params. */
export type JiraOAuthExchangeFailure =
  | "jira_token_failed"
  | "jira_resources_failed"
  | "jira_no_site";

export type JiraOAuthExchangeResult =
  | { ok: true; connection: JiraOAuthConnection }
  | { ok: false; error: JiraOAuthExchangeFailure };

export interface JiraOAuthExchangeDeps {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  /** Defaults to the global fetch; tests inject a fake. */
  fetchImpl?: typeof fetch;
}

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
        redirect_uri: `${deps.appUrl}/api/integrations/jira/callback`,
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
