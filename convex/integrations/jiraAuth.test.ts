/**
 * The Jira adapter's token operations with injected fetch/clock/vault key:
 * refresh round-trip (success + failure) and the freshness gate, driven
 * through the real code paths — no faked globals, no env vars.
 */
import { describe, it, expect, vi } from "vitest";
import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import * as TokenVault from "../model/tokenVault";
import { getValidAccessToken, refreshJiraToken } from "./jiraAuth";

// 64 lowercase hex chars — a valid vault key, injected explicitly.
const TEST_KEY = "0123456789abcdef".repeat(4);

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

function tokenResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("refreshJiraToken", () => {
  it("posts the decrypted refresh token and persists re-encrypted tokens with the single-source expiresAt", async () => {
    const { ctx, runMutation } = fakeCtx();
    const connection = await fakeConnection(NOW - 1_000); // stale
    const fetchImpl = vi.fn(async () =>
      tokenResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      })
    );

    const accessToken = await refreshJiraToken(ctx, connection, {
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      keyHex: TEST_KEY,
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
      })
    ).rejects.toThrow("Failed to refresh Jira token: 400 bad refresh");
    expect(runMutation).not.toHaveBeenCalled();
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
      tokenResponse({
        access_token: "refreshed-access",
        refresh_token: "refreshed-refresh",
        expires_in: 3600,
      })
    );

    const token = await getValidAccessToken(ctx, connection, {
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
      keyHex: TEST_KEY,
    });

    expect(token).toBe("refreshed-access");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});
