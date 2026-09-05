/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { type T, seedUser } from "./analytics.seeds";
import { mintUnsubscribeToken, verifyUnsubscribeToken } from "./model/unsubscribe";

// Opt-out (spec §16.4, ADR-0020): one flag on `users`, flipped from Settings
// or by a one-click unsubscribe token that works signed out. The token is
// `{userId}.{base64url(HMAC-SHA256(userId, UNSUBSCRIBE_SECRET))}`; a
// tampered token flips nothing.

const modules = import.meta.glob("./**/*.*s");
const SECRET = "test-unsubscribe-secret";

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = SECRET;
  // `http.ts` registers the auth routes at load; the auth module wants these.
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret-at-least-32-chars";
  process.env.SITE_URL ??= "http://localhost:3000";
});

const as = (t: T, subject: string) => t.withIdentity({ subject });

describe("the unsubscribe token", () => {
  it("round-trips: a minted token verifies to its user id", async () => {
    const token = await mintUnsubscribeToken("user123", SECRET);
    expect(token.startsWith("user123.")).toBe(true);
    expect(token).toMatch(/^user123\.[A-Za-z0-9_-]+$/);
    expect(await verifyUnsubscribeToken(token, SECRET)).toBe("user123");
  });

  it("refuses a tampered id, a tampered MAC, another secret and garbage", async () => {
    const token = await mintUnsubscribeToken("user123", SECRET);
    const [id, mac] = token.split(".");
    expect(await verifyUnsubscribeToken(`user124.${mac}`, SECRET)).toBeNull();
    expect(await verifyUnsubscribeToken(`${id}.${mac.slice(0, -1)}A`, SECRET)).toBeNull();
    expect(await verifyUnsubscribeToken(token, "other-secret")).toBeNull();
    expect(await verifyUnsubscribeToken("", SECRET)).toBeNull();
    expect(await verifyUnsubscribeToken("nodot", SECRET)).toBeNull();
  });
});

describe("email.unsubscribe — the one mutation with no auth guard", () => {
  it("flips exactly the addressed user's flag, signed out", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a", "A", "permanent");
    const otherId = await seedUser(t, "auth-b", "B", "permanent");
    const token = await mintUnsubscribeToken(userId, SECRET);

    const result = await t.mutation(api.email.unsubscribe, { token });

    expect(result).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(userId)))!.emailOptOut).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(otherId)))!.emailOptOut).toBeUndefined();
  });

  it("a tampered token flips nothing and does not throw", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a", "A", "permanent");
    const otherId = await seedUser(t, "auth-b", "B", "permanent");
    const token = await mintUnsubscribeToken(userId, SECRET);
    const [, mac] = token.split(".");

    expect(await t.mutation(api.email.unsubscribe, { token: `${otherId}.${mac}` })).toBe(false);
    expect(await t.mutation(api.email.unsubscribe, { token: "garbage" })).toBe(false);

    expect((await t.run((ctx) => ctx.db.get(userId)))!.emailOptOut).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get(otherId)))!.emailOptOut).toBeUndefined();
  });

  it("a valid token for a deleted account flips nothing", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a", "A", "permanent");
    const token = await mintUnsubscribeToken(userId, SECRET);
    await t.run((ctx) => ctx.db.delete(userId));
    expect(await t.mutation(api.email.unsubscribe, { token })).toBe(false);
  });
});

describe("users.setEmailOptOut — the Settings toggle", () => {
  it("writes the flag for the signed-in account, both ways", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a", "A", "permanent");

    await as(t, "auth-a").mutation(api.users.setEmailOptOut, { optOut: true });
    expect((await t.run((ctx) => ctx.db.get(userId)))!.emailOptOut).toBe(true);

    await as(t, "auth-a").mutation(api.users.setEmailOptOut, { optOut: false });
    expect((await t.run((ctx) => ctx.db.get(userId)))!.emailOptOut).toBe(false);
  });

  it("refuses a visitor without a session", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.setEmailOptOut, { optOut: true })).rejects.toThrow();
  });
});

describe("POST /api/unsubscribe — RFC 8058 one-click", () => {
  it("answers 200 and flips the flag", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a", "A", "permanent");
    const token = await mintUnsubscribeToken(userId, SECRET);

    const response = await t.fetch(`/api/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });

    expect(response.status).toBe(200);
    expect((await t.run((ctx) => ctx.db.get(userId)))!.emailOptOut).toBe(true);
  });

  it("answers 200 to a tampered token and flips nothing", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-a", "A", "permanent");

    const response = await t.fetch(`/api/unsubscribe?token=${userId}.nope`, { method: "POST" });

    expect(response.status).toBe(200);
    expect((await t.run((ctx) => ctx.db.get(userId)))!.emailOptOut).toBeUndefined();
  });
});
