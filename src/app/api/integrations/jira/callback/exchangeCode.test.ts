/**
 * The Jira OAuth code exchange with an injected fetch: token exchange →
 * accessible resources → best-effort user info, plus every failure branch the
 * callback route maps to a redirect.
 */
import { describe, it, expect, vi } from "vitest";
import { exchangeJiraCode } from "./exchangeCode";

const DEPS = {
  clientId: "jira-client-id",
  clientSecret: "jira-client-secret",
  appUrl: "https://agilekit.app",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TOKENS = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  expires_in: 3600,
  scope: "read:jira-work write:jira-work",
};

const RESOURCES = [{ id: "cloud-1", url: "https://team.atlassian.net" }];

describe("exchangeJiraCode", () => {
  it("runs the full exchange and shapes the connection for connectJira", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => jsonResponse(TOKENS))
      .mockImplementationOnce(async () => jsonResponse(RESOURCES))
      .mockImplementationOnce(async () =>
        jsonResponse({ account_id: "jira-user-1", email: "u@example.com" })
      );

    const result = await exchangeJiraCode("the-code", {
      ...DEPS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      connection: {
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresIn: 3600,
        scopes: ["read:jira-work", "write:jira-work"],
        cloudId: "cloud-1",
        siteUrl: "https://team.atlassian.net",
        providerUserId: "jira-user-1",
        providerUserEmail: "u@example.com",
      },
    });

    // The token exchange posts the code and the app's redirect URI.
    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(tokenUrl).toBe("https://auth.atlassian.com/oauth/token");
    const sentBody = JSON.parse(tokenInit.body as string);
    expect(sentBody).toMatchObject({
      grant_type: "authorization_code",
      client_id: "jira-client-id",
      client_secret: "jira-client-secret",
      code: "the-code",
      redirect_uri: "https://agilekit.app/api/integrations/jira/callback",
    });

    // The follow-up calls authenticate with the fresh access token.
    for (const call of fetchImpl.mock.calls.slice(1)) {
      const [, init] = call as unknown as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer access-1"
      );
    }
  });

  it("maps a failed token exchange to jira_token_failed", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "invalid_grant" }, 400)
    );
    const result = await exchangeJiraCode("bad-code", {
      ...DEPS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, error: "jira_token_failed" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps a failed resources fetch to jira_resources_failed", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => jsonResponse(TOKENS))
      .mockImplementationOnce(async () => jsonResponse({}, 500));
    const result = await exchangeJiraCode("the-code", {
      ...DEPS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, error: "jira_resources_failed" });
  });

  it("maps an empty resources list to jira_no_site", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => jsonResponse(TOKENS))
      .mockImplementationOnce(async () => jsonResponse([]));
    const result = await exchangeJiraCode("the-code", {
      ...DEPS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, error: "jira_no_site" });
  });

  it("tolerates a failed /me lookup — user metadata is best-effort", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => jsonResponse(TOKENS))
      .mockImplementationOnce(async () => jsonResponse(RESOURCES))
      .mockImplementationOnce(async () => jsonResponse({}, 403));
    const result = await exchangeJiraCode("the-code", {
      ...DEPS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.connection.providerUserId).toBeUndefined();
      expect(result.connection.providerUserEmail).toBeUndefined();
    }
  });
});
