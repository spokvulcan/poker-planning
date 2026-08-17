/// <reference types="vite/client" />
/**
 * The token-refresh sweep (cron refresh-oauth-tokens) and its
 * provider-parameterized expiring-connections query. The sweep iterates the
 * provider registry; refresh itself fails closed here (seed tokens never
 * decrypt) and must neither throw nor touch other connections — the success
 * path is covered with injected deps in integrations/jiraAuth.test.ts.
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

async function seedUser(t: T, authUserId: string): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", { authUserId, name: "U", createdAt: Date.now() })
  );
}

async function seedConnection(
  t: T,
  userId: Id<"users">,
  provider: "jira" | "github",
  expiresAt: number
): Promise<Id<"integrationConnections">> {
  return t.run((ctx) =>
    ctx.db.insert("integrationConnections", {
      userId,
      provider,
      encryptedAccessToken: "enc-access",
      accessTokenIv: "iv",
      accessTokenAuthTag: "tag",
      encryptedRefreshToken: "enc-refresh",
      refreshTokenIv: "riv",
      refreshTokenAuthTag: "rtag",
      expiresAt,
      scopes: [],
      connectedAt: Date.now(),
      lastRefreshedAt: Date.now(),
    })
  );
}

describe("getExpiringConnections", () => {
  it("filters by the given provider and the expiry threshold", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");
    const soon = Date.now() - 1_000;
    const expiring = await seedConnection(t, userId, "jira", soon);
    await seedConnection(t, userId, "jira", Date.now() + 7_200_000); // fresh
    await seedConnection(t, userId, "github", soon); // other provider

    const jiraExpiring = await t.query(
      internal.integrations.tokenRefresh.getExpiringConnections,
      { provider: "jira", expiryThreshold: Date.now() + 45 * 60 * 1000 }
    );
    expect(jiraExpiring.map((c) => c._id)).toEqual([expiring]);

    const githubExpiring = await t.query(
      internal.integrations.tokenRefresh.getExpiringConnections,
      { provider: "github", expiryThreshold: Date.now() + 45 * 60 * 1000 }
    );
    expect(githubExpiring).toHaveLength(1);
    expect(githubExpiring[0].provider).toBe("github");
  });
});

describe("refreshExpiringTokens", () => {
  it("sweeps expiring connections through the registry and fails closed per connection", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");
    const expiring = await seedConnection(t, userId, "jira", Date.now() - 1_000);
    const fresh = await seedConnection(t, userId, "jira", Date.now() + 7_200_000);

    // Refresh of the expiring connection fails (seed tokens don't decrypt) —
    // the sweep logs and continues rather than failing the cron run.
    await t.action(internal.integrations.tokenRefresh.refreshExpiringTokens, {});

    // Nothing was persisted: the failed refresh wrote no tokens, and the
    // fresh connection was never touched.
    const expiringAfter = await t.run((ctx) => ctx.db.get(expiring));
    const freshAfter = await t.run((ctx) => ctx.db.get(fresh));
    expect(expiringAfter?.encryptedAccessToken).toBe("enc-access");
    expect(freshAfter?.encryptedAccessToken).toBe("enc-access");
  });
});
