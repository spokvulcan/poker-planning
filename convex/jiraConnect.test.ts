/// <reference types="vite/client" />
/**
 * Connecting Jira (the public connectJira action the OAuth callback calls):
 * the tokens are stored as vault ciphertext. The action is registered, so it
 * reads the deployment's settings from the environment, stubbed here.
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import * as TokenVault from "./model/tokenVault";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

// 64 lowercase hex chars — a valid vault key.
const TEST_KEY = "0123456789abcdef".repeat(4);

// Plaintext fixtures contain non-hex characters so they can never pass as
// ciphertext.
const PLAINTEXT_ACCESS = "plaintext-access-token!";
const PLAINTEXT_REFRESH = "plaintext-refresh-token?";

const CONNECTION = {
  accessToken: PLAINTEXT_ACCESS,
  refreshToken: PLAINTEXT_REFRESH,
  expiresIn: 3600,
  cloudId: "cloud-1",
  siteUrl: "https://team.atlassian.net",
  scopes: ["read:jira-work", "offline_access"],
  providerUserId: "jira-user-1",
  providerUserEmail: "u@example.com",
};

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
  vi.stubEnv("JIRA_CLIENT_ID", "jira-client-id");
  vi.stubEnv("JIRA_CLIENT_SECRET", "jira-client-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A signed-in person with a users row. */
async function signedIn(t: T) {
  await t.run((ctx) =>
    ctx.db.insert("users", { authUserId: "auth-u", name: "U", createdAt: Date.now() })
  );
  return t.withIdentity({ subject: "auth-u" });
}

async function storedConnections(t: T) {
  return t.run((ctx) => ctx.db.query("integrationConnections").collect());
}

describe("connectJira", () => {
  it("stores the tokens as vault ciphertext beside the site and expiry", async () => {
    const t = convexTest(schema, modules);
    const person = await signedIn(t);

    const before = Date.now();
    await person.action(api.integrations.jira.connectJira, CONNECTION);
    const after = Date.now();

    const [stored] = await storedConnections(t);
    expect(stored).toMatchObject({
      provider: "jira",
      cloudId: "cloud-1",
      siteUrl: "https://team.atlassian.net",
      scopes: ["read:jira-work", "offline_access"],
      providerUserId: "jira-user-1",
      providerUserEmail: "u@example.com",
    });
    expect(stored.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(stored.expiresAt).toBeLessThanOrEqual(after + 3_600_000);

    expect(JSON.stringify(stored)).not.toContain(PLAINTEXT_ACCESS);
    expect(JSON.stringify(stored)).not.toContain(PLAINTEXT_REFRESH);
    expect(await TokenVault.decryptAccessToken(stored, TEST_KEY)).toBe(PLAINTEXT_ACCESS);
    expect(await TokenVault.decryptRefreshToken(stored, TEST_KEY)).toBe(PLAINTEXT_REFRESH);
  });
});
