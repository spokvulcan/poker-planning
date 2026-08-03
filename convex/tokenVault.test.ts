/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import * as TokenVault from "./model/tokenVault";
import * as Integrations from "./model/integrations";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

// 64 lowercase hex chars — a valid key, injected explicitly so the tests never
// touch process.env.
const TEST_KEY = "0123456789abcdef".repeat(4);

// Plaintext fixtures deliberately contain non-hex characters so they can
// never collide with ciphertext material.
const PLAINTEXT_ACCESS = "plaintext-access-token!";
const PLAINTEXT_REFRESH = "plaintext-refresh-token?";

async function seedUser(t: T, authUserId: string): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId,
      name: "U",
      createdAt: Date.now(),
    })
  );
}

async function saveViaVault(
  t: T,
  userId: Id<"users">
): Promise<Id<"integrationConnections">> {
  const enc = await TokenVault.encryptTokens(
    { accessToken: PLAINTEXT_ACCESS, refreshToken: PLAINTEXT_REFRESH },
    TEST_KEY
  );
  return t.mutation(internal.integrations.jira.saveConnection, {
    userId,
    provider: "jira",
    ...enc,
    expiresAt: Date.now() + 3_600_000,
    scopes: ["read:jira-work"],
  });
}

describe("encrypt/decrypt round-trip", () => {
  it("round-trips both tokens through the vault", async () => {
    const enc = await TokenVault.encryptTokens(
      { accessToken: PLAINTEXT_ACCESS, refreshToken: PLAINTEXT_REFRESH },
      TEST_KEY
    );

    expect(await TokenVault.decryptAccessToken(enc, TEST_KEY)).toBe(
      PLAINTEXT_ACCESS
    );
    expect(await TokenVault.decryptRefreshToken(enc, TEST_KEY)).toBe(
      PLAINTEXT_REFRESH
    );
  });

  it("emits only hex ciphertext fields", async () => {
    const enc = await TokenVault.encryptTokens(
      { accessToken: PLAINTEXT_ACCESS, refreshToken: PLAINTEXT_REFRESH },
      TEST_KEY
    );

    expect(enc.encryptedAccessToken).toMatch(/^[0-9a-f]+$/);
    expect(enc.accessTokenIv).toMatch(/^[0-9a-f]{24}$/);
    expect(enc.accessTokenAuthTag).toMatch(/^[0-9a-f]{32}$/);
    expect(enc.encryptedRefreshToken).toMatch(/^[0-9a-f]+$/);
    expect(JSON.stringify(enc)).not.toContain(PLAINTEXT_ACCESS);
    expect(JSON.stringify(enc)).not.toContain(PLAINTEXT_REFRESH);
  });

  it("omits refresh fields when no refresh token is given", async () => {
    const enc = await TokenVault.encryptTokens(
      { accessToken: PLAINTEXT_ACCESS },
      TEST_KEY
    );

    expect(enc.encryptedRefreshToken).toBeUndefined();
    expect(enc.refreshTokenIv).toBeUndefined();
    expect(enc.refreshTokenAuthTag).toBeUndefined();
    await expect(TokenVault.decryptRefreshToken(enc, TEST_KEY)).rejects.toThrow(
      "No refresh token available for this connection"
    );
  });

  it("rejects tampered ciphertext", async () => {
    const enc = await TokenVault.encryptTokens(
      { accessToken: PLAINTEXT_ACCESS },
      TEST_KEY
    );

    // Flip one byte inside the ciphertext.
    const tampered = {
      ...enc,
      encryptedAccessToken:
        (enc.encryptedAccessToken[0] === "0" ? "1" : "0") +
        enc.encryptedAccessToken.slice(1),
    };
    await expect(
      TokenVault.decryptAccessToken(tampered, TEST_KEY)
    ).rejects.toThrow();

    // Flip one byte inside the auth tag.
    const tamperedTag = {
      ...enc,
      accessTokenAuthTag:
        (enc.accessTokenAuthTag[0] === "0" ? "1" : "0") +
        enc.accessTokenAuthTag.slice(1),
    };
    await expect(
      TokenVault.decryptAccessToken(tamperedTag, TEST_KEY)
    ).rejects.toThrow();
  });

  it("rejects empty tokens up front instead of producing empty ciphertext", async () => {
    // AES-GCM ciphertext length equals plaintext length, so an empty token
    // would round-trip to "" and then fail the write-side tripwire as
    // "possible plaintext" — the vault names the real problem instead.
    await expect(
      TokenVault.encryptTokens({ accessToken: "" }, TEST_KEY)
    ).rejects.toThrow("Cannot encrypt an empty access token");
    await expect(
      TokenVault.encryptTokens(
        { accessToken: PLAINTEXT_ACCESS, refreshToken: "" },
        TEST_KEY
      )
    ).rejects.toThrow("Cannot encrypt an empty refresh token");
  });
});

describe("isAccessTokenFresh", () => {
  const now = 1_000_000_000;

  it("applies the expiresAt > now + 60s rule at the boundary", () => {
    expect(TokenVault.isAccessTokenFresh(now + 60_001, now)).toBe(true);
    expect(TokenVault.isAccessTokenFresh(now + 60_000, now)).toBe(false);
    expect(TokenVault.isAccessTokenFresh(now + 1, now)).toBe(false);
    expect(TokenVault.isAccessTokenFresh(now - 1, now)).toBe(false);
  });
});

describe("key validation", () => {
  it("accepts only a 64-char hex key", () => {
    expect(TokenVault.assertValidEncryptionKey(TEST_KEY)).toBe(TEST_KEY);
    expect(TokenVault.assertValidEncryptionKey("A".repeat(64))).toBe(
      "A".repeat(64)
    );

    expect(() => TokenVault.assertValidEncryptionKey(undefined)).toThrow(
      "Missing TOKEN_ENCRYPTION_KEY"
    );
    expect(() => TokenVault.assertValidEncryptionKey("")).toThrow(
      "Missing TOKEN_ENCRYPTION_KEY"
    );
    expect(() => TokenVault.assertValidEncryptionKey("0".repeat(63))).toThrow(
      "Invalid TOKEN_ENCRYPTION_KEY"
    );
    expect(() => TokenVault.assertValidEncryptionKey("z".repeat(64))).toThrow(
      "Invalid TOKEN_ENCRYPTION_KEY"
    );
  });
});

describe("assertEncryptedTokenFields", () => {
  it("accepts vault output and rejects plaintext or partial refresh triples", async () => {
    const enc = await TokenVault.encryptTokens(
      { accessToken: PLAINTEXT_ACCESS, refreshToken: PLAINTEXT_REFRESH },
      TEST_KEY
    );
    expect(() => TokenVault.assertEncryptedTokenFields(enc)).not.toThrow();

    expect(() =>
      TokenVault.assertEncryptedTokenFields({
        ...enc,
        encryptedAccessToken: PLAINTEXT_ACCESS,
      })
    ).toThrow(/refusing to store possible plaintext/);

    // Odd-length or empty hex is not AES-GCM output either.
    expect(() =>
      TokenVault.assertEncryptedTokenFields({ ...enc, accessTokenIv: "abc" })
    ).toThrow(/refusing to store possible plaintext/);
    expect(() =>
      TokenVault.assertEncryptedTokenFields({ ...enc, accessTokenAuthTag: "" })
    ).toThrow(/refusing to store possible plaintext/);

    // Refresh fields are all-or-nothing.
    expect(() =>
      TokenVault.assertEncryptedTokenFields({
        ...enc,
        refreshTokenIv: undefined,
      })
    ).toThrow(/all-or-nothing/);
  });
});

describe("vault write path (convex-test)", () => {
  it("persists no plaintext and stores iv/tag-packed ciphertext", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");

    const connectionId = await saveViaVault(t, userId);
    const row = await t.run((ctx) => ctx.db.get(connectionId));

    expect(row).not.toBeNull();
    // No plaintext anywhere in the stored row.
    expect(JSON.stringify(row)).not.toContain(PLAINTEXT_ACCESS);
    expect(JSON.stringify(row)).not.toContain(PLAINTEXT_REFRESH);
    // Ciphertext fields carry the packed hex format.
    expect(row!.encryptedAccessToken).toMatch(/^[0-9a-f]+$/);
    expect(row!.accessTokenIv).toMatch(/^[0-9a-f]{24}$/);
    expect(row!.accessTokenAuthTag).toMatch(/^[0-9a-f]{32}$/);
  });

  it("read-then-decrypt through the model returns the original tokens", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");

    const connectionId = await saveViaVault(t, userId);
    const row = await t.run((ctx) => ctx.db.get(connectionId));

    expect(await TokenVault.decryptAccessToken(row!, TEST_KEY)).toBe(
      PLAINTEXT_ACCESS
    );
    expect(await TokenVault.decryptRefreshToken(row!, TEST_KEY)).toBe(
      PLAINTEXT_REFRESH
    );
  });

  it("toConnectionView leaks no ciphertext material", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");

    const connectionId = await saveViaVault(t, userId);
    const row = await t.run((ctx) => ctx.db.get(connectionId));
    const view = Integrations.toConnectionView(row!);

    expect(JSON.stringify(view)).not.toContain(row!.encryptedAccessToken);
    expect(JSON.stringify(view)).not.toContain(row!.encryptedRefreshToken!);
    expect(JSON.stringify(view)).not.toContain(row!.accessTokenIv);
    expect(JSON.stringify(view)).not.toContain(PLAINTEXT_ACCESS);
  });

  it("updateTokens rewrites the tokens through the vault", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");
    const connectionId = await saveViaVault(t, userId);
    const before = await t.run((ctx) => ctx.db.get(connectionId));

    const NEW_ACCESS = "rotated-access-token!";
    const NEW_REFRESH = "rotated-refresh-token?";
    const enc = await TokenVault.encryptTokens(
      { accessToken: NEW_ACCESS, refreshToken: NEW_REFRESH },
      TEST_KEY
    );
    const newExpiry = Date.now() + 7_200_000;
    await t.mutation(internal.integrations.jira.updateTokens, {
      connectionId,
      ...enc,
      expiresAt: newExpiry,
    });

    const after = await t.run((ctx) => ctx.db.get(connectionId));
    expect(JSON.stringify(after)).not.toContain(NEW_ACCESS);
    expect(JSON.stringify(after)).not.toContain(NEW_REFRESH);
    expect(after!.expiresAt).toBe(newExpiry);
    expect(after!.lastRefreshedAt).toBeGreaterThanOrEqual(
      before!.lastRefreshedAt
    );
    expect(await TokenVault.decryptAccessToken(after!, TEST_KEY)).toBe(
      NEW_ACCESS
    );
    expect(await TokenVault.decryptRefreshToken(after!, TEST_KEY)).toBe(
      NEW_REFRESH
    );
  });

  it("the registered write mutations refuse plaintext token fields", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "auth-u");

    await expect(
      t.mutation(internal.integrations.jira.saveConnection, {
        userId,
        provider: "jira",
        encryptedAccessToken: PLAINTEXT_ACCESS,
        accessTokenIv: "aa",
        accessTokenAuthTag: "bb",
        expiresAt: Date.now(),
        scopes: [],
      })
    ).rejects.toThrow(/refusing to store possible plaintext/);

    const connectionId = await saveViaVault(t, userId);
    await expect(
      t.mutation(internal.integrations.jira.updateTokens, {
        connectionId,
        encryptedAccessToken: PLAINTEXT_ACCESS,
        accessTokenIv: "aa",
        accessTokenAuthTag: "bb",
        expiresAt: Date.now(),
      })
    ).rejects.toThrow(/refusing to store possible plaintext/);
  });
});
