/// <reference types="vite/client" />
/**
 * Connecting Jira (the public connectJira action the OAuth callback calls):
 * the tokens are stored as vault ciphertext, and a deployment missing a Jira
 * setting refuses at connect rather than at the first token refresh. The
 * action is registered, so it reads the deployment's settings from the
 * environment, stubbed here.
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import * as TokenVault from "./model/tokenVault";
import { connectJiraWithCode } from "./integrations/jiraAuth";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

// 64 lowercase hex chars — a valid vault key.
const TEST_KEY = "0123456789abcdef".repeat(4);

// Plaintext fixtures contain non-hex characters so they can never pass as
// ciphertext.
const PLAINTEXT_ACCESS = "plaintext-access-token!";
const PLAINTEXT_REFRESH = "plaintext-refresh-token?";

const NOW = 1_700_000_000_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Atlassian as the code exchange meets it: the token endpoint trades a code
 * for the plaintext pair (or refuses it with `tokenStatus`), the resources
 * endpoint grants one Jira site, and /me names the Jira user.
 */
function atlassian({ tokenStatus = 200 } = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    switch (String(input)) {
      case "https://auth.atlassian.com/oauth/token":
        return tokenStatus === 200
          ? json({
              access_token: PLAINTEXT_ACCESS,
              refresh_token: PLAINTEXT_REFRESH,
              expires_in: 3600,
              scope: "read:jira-work offline_access",
            })
          : json({ error: "invalid_grant" }, tokenStatus);
      case "https://api.atlassian.com/oauth/token/accessible-resources":
        return json([{ id: "cloud-1", url: "https://team.atlassian.net" }]);
      case "https://api.atlassian.com/me":
        return json({ account_id: "jira-user-1", email: "u@example.com" });
      default:
        return json({}, 404);
    }
  }) as typeof fetch;
}

/** Runs the handshake's core in an action, with Atlassian, the clock and the vault key injected. */
function connectWithCode(t: T, userId: Id<"users">, code: string, fetchImpl: typeof fetch) {
  return t.action((ctx) =>
    connectJiraWithCode(ctx, userId, code, {
      fetchImpl,
      now: () => NOW,
      keyHex: TEST_KEY,
      credentials: { clientId: "jira-client-id", clientSecret: "jira-client-secret" },
    })
  );
}

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
  vi.stubEnv("JIRA_CLIENT_ID", "jira-client-id");
  vi.stubEnv("JIRA_CLIENT_SECRET", "jira-client-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A person's users row. */
async function seedUser(t: T): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", { authUserId: "auth-u", name: "U", createdAt: Date.now() })
  );
}

/** A signed-in person with a users row. */
async function signedIn(t: T) {
  await seedUser(t);
  return t.withIdentity({ subject: "auth-u" });
}

async function storedConnections(t: T) {
  return t.run((ctx) => ctx.db.query("integrationConnections").collect());
}

/** The ConvexError data a call is refused with. */
async function refusalOf(
  call: Promise<unknown>
): Promise<{ code: string; message: string }> {
  try {
    await call;
  } catch (error) {
    if (error instanceof ConvexError) return error.data as { code: string; message: string };
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("connecting Jira with an authorization code", () => {
  it("stores the tokens Atlassian trades for the code as vault ciphertext, beside the site and expiry", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await connectWithCode(t, userId, "the-code", atlassian());

    const [stored] = await storedConnections(t);
    expect(stored).toMatchObject({
      userId,
      provider: "jira",
      cloudId: "cloud-1",
      siteUrl: "https://team.atlassian.net",
      scopes: ["read:jira-work", "offline_access"],
      providerUserId: "jira-user-1",
      providerUserEmail: "u@example.com",
      expiresAt: NOW + 3_600_000,
    });

    expect(JSON.stringify(stored)).not.toContain(PLAINTEXT_ACCESS);
    expect(JSON.stringify(stored)).not.toContain(PLAINTEXT_REFRESH);
    expect(await TokenVault.decryptAccessToken(stored, TEST_KEY)).toBe(PLAINTEXT_ACCESS);
    expect(await TokenVault.decryptRefreshToken(stored, TEST_KEY)).toBe(PLAINTEXT_REFRESH);
  });

  it("trades the code with this deployment's callback (SITE_URL) as the redirect", async () => {
    vi.stubEnv("SITE_URL", "https://agilekit.app");
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const tokenRequests: Record<string, unknown>[] = [];
    const recorded = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "https://auth.atlassian.com/oauth/token") {
        tokenRequests.push(JSON.parse(init?.body as string));
      }
      return atlassian()(input, init);
    }) as typeof fetch;

    await connectWithCode(t, userId, "the-code", recorded);

    expect(tokenRequests).toEqual([
      expect.objectContaining({
        code: "the-code",
        redirect_uri: "https://agilekit.app/api/integrations/jira/callback",
      }),
    ]);
  });

  it("refuses with the code of the step that failed, and stores nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const refusal = await refusalOf(
      connectWithCode(t, userId, "stale-code", atlassian({ tokenStatus: 400 }))
    );

    expect(refusal).toEqual({ code: "jira_token_failed", message: expect.any(String) });
    expect(await storedConnections(t)).toHaveLength(0);
  });
});

describe("connectJira", () => {
  it("takes the authorization code and no tokens", async () => {
    const t = convexTest(schema, modules);
    const person = await signedIn(t);
    const withTokens = {
      code: "the-code",
      accessToken: PLAINTEXT_ACCESS,
      refreshToken: PLAINTEXT_REFRESH,
    } as unknown as { code: string };

    await expect(
      person.action(api.integrations.jira.connectJira, withTokens)
    ).rejects.toThrow("Unexpected field `accessToken`");
    expect(await storedConnections(t)).toHaveLength(0);
  });

  it("refuses while a Jira setting is missing on Convex, naming it, and stores nothing", async () => {
    vi.stubEnv("JIRA_CLIENT_SECRET", undefined);
    const t = convexTest(schema, modules);
    const person = await signedIn(t);

    const refusal = await refusalOf(
      person.action(api.integrations.jira.connectJira, { code: "the-code" })
    );

    expect(refusal).toEqual({
      code: "jira_not_configured",
      message: expect.stringContaining("JIRA_CLIENT_SECRET"),
    });
    expect(refusal.message).not.toContain("JIRA_CLIENT_ID");
    expect(await storedConnections(t)).toHaveLength(0);
  });
});
