/**
 * The Jira adapter's OAuth operations with injected fetch/clock/vault
 * key/client credentials: the code exchange (token exchange → accessible
 * resources → best-effort user info, and every failure it reports), the
 * refresh round-trip (success + failure) and the freshness gate, driven
 * through the real code paths — no faked globals, no env vars.
 */
import { describe, it, expect, vi } from "vitest";
import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import * as TokenVault from "../model/tokenVault";
import { exchangeJiraCode, getValidAccessToken, refreshJiraToken } from "./jiraAuth";

// 64 lowercase hex chars — a valid vault key, injected explicitly.
const TEST_KEY = "0123456789abcdef".repeat(4);

// The Jira OAuth app's credentials, injected explicitly.
const CREDENTIALS = {
  clientId: "jira-client-id",
  clientSecret: "jira-client-secret",
};

const PLAINTEXT_ACCESS = "plaintext-access-token!";
const PLAINTEXT_REFRESH = "plaintext-refresh-token?";

const NOW = 1_700_000_000_000;

async function fakeConnection(
  expiresAt: number
): Promise<Doc<"integrationConnections">> {
  const enc = await TokenVault.encryptTokens(
    { accessToken: PLAINTEXT_ACCESS, refreshToken: PLAINTEXT_REFRESH },
    TEST_KEY
  );
  return {
    _id: "conn-1" as Id<"integrationConnections">,
    _creationTime: NOW,
    userId: "user-1" as Id<"users">,
    provider: "jira",
    ...enc,
    expiresAt,
    cloudId: "cloud-1",
    siteUrl: "https://team.atlassian.net",
    scopes: ["read:jira-work"],
    connectedAt: NOW,
    lastRefreshedAt: NOW,
  };
}

function fakeCtx() {
  const runMutation = vi.fn(
    async (_ref: unknown, _args: Record<string, unknown>) => null
  );
  return {
    ctx: { runMutation } as unknown as ActionCtx,
    runMutation,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("exchangeJiraCode", () => {
  const DEPS = {
    ...CREDENTIALS,
    redirectUri: "https://agilekit.app/api/integrations/jira/callback",
  };

  const TOKENS = {
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_in: 3600,
    scope: "read:jira-work write:jira-work",
  };

  const RESOURCES = [{ id: "cloud-1", url: "https://team.atlassian.net" }];

  it("runs the full exchange and shapes the connection to store", async () => {
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

  it.each([
    ["a javascript: URL", "javascript:alert(1)"],
    ["a plain-http site", "http://team.atlassian.net"],
    ["a site outside atlassian.net", "https://team.example.com"],
  ])("refuses %s as the site, so it never becomes a link (jira_no_site)", async (_, url) => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => jsonResponse(TOKENS))
      .mockImplementationOnce(async () => jsonResponse([{ id: "cloud-1", url }]));

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

describe("refreshJiraToken", () => {
  it("posts the decrypted refresh token and persists re-encrypted tokens with the single-source expiresAt", async () => {
    const { ctx, runMutation } = fakeCtx();
    const connection = await fakeConnection(NOW - 1_000); // stale
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      })
    );

    const accessToken = await refreshJiraToken(ctx, connection, {
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      keyHex: TEST_KEY,
      credentials: CREDENTIALS,
    });

    expect(accessToken).toBe("new-access");

    // The request carries the decrypted stored refresh token.
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://auth.atlassian.com/oauth/token");
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.grant_type).toBe("refresh_token");
    expect(sentBody.refresh_token).toBe(PLAINTEXT_REFRESH);

    // The persisted update: vault ciphertext fields and expiresAt computed
    // from the injected clock in exactly one place (computeExpiresAt).
    expect(runMutation).toHaveBeenCalledTimes(1);
    const update = runMutation.mock.calls[0][1];
    expect(update.connectionId).toBe(connection._id);
    expect(update.expiresAt).toBe(TokenVault.computeExpiresAt(3600, NOW));
    for (const field of [
      "encryptedAccessToken",
      "accessTokenIv",
      "accessTokenAuthTag",
      "encryptedRefreshToken",
      "refreshTokenIv",
      "refreshTokenAuthTag",
    ]) {
      expect(update[field]).toMatch(/^[0-9a-f]+$/);
    }
    expect(JSON.stringify(update)).not.toContain("new-access");
    expect(JSON.stringify(update)).not.toContain("new-refresh");

    // And the persisted fields really decrypt to the rotated pair.
    const roundTripped = update as unknown as TokenVault.EncryptedTokenFields;
    expect(await TokenVault.decryptAccessToken(roundTripped, TEST_KEY)).toBe(
      "new-access"
    );
    expect(await TokenVault.decryptRefreshToken(roundTripped, TEST_KEY)).toBe(
      "new-refresh"
    );
  });

  it("throws on a failed refresh and persists nothing", async () => {
    const { ctx, runMutation } = fakeCtx();
    const connection = await fakeConnection(NOW - 1_000);
    const fetchImpl = vi.fn(
      async () => new Response("bad refresh", { status: 400 })
    );

    await expect(
      refreshJiraToken(ctx, connection, {
        fetchImpl: fetchImpl as typeof fetch,
        now: () => NOW,
        keyHex: TEST_KEY,
        credentials: CREDENTIALS,
      })
    ).rejects.toThrow("Failed to refresh Jira token: 400 bad refresh");
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("posts the Jira OAuth app's credentials with the refresh token", async () => {
    const { ctx } = fakeCtx();
    const connection = await fakeConnection(NOW - 1_000);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      })
    );

    await refreshJiraToken(ctx, connection, {
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      keyHex: TEST_KEY,
      credentials: CREDENTIALS,
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      client_id: "jira-client-id",
      client_secret: "jira-client-secret",
    });
  });
});

describe("getValidAccessToken", () => {
  it("decrypts the stored token while fresh — no network", async () => {
    const { ctx } = fakeCtx();
    const connection = await fakeConnection(NOW + 3_600_000);
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch must not be called for a fresh token");
    });

    const token = await getValidAccessToken(ctx, connection, {
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      keyHex: TEST_KEY,
    });

    expect(token).toBe(PLAINTEXT_ACCESS);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes instead when the token is inside the expiry buffer", async () => {
    const { ctx, runMutation } = fakeCtx();
    // 30 seconds out — inside the vault's 60-second freshness buffer.
    const connection = await fakeConnection(NOW + 30_000);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: "refreshed-access",
        refresh_token: "refreshed-refresh",
        expires_in: 3600,
      })
    );

    const token = await getValidAccessToken(ctx, connection, {
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      keyHex: TEST_KEY,
      credentials: CREDENTIALS,
    });

    expect(token).toBe("refreshed-access");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});
