/**
 * The token vault: the one owner of the token-field contract for
 * integrationConnections.
 *
 * Provider-agnostic by construction — nothing here knows about Jira, so the
 * future GitHub adapter encrypts and reads tokens through the same helpers.
 * lib/encryption stays the pure AES-GCM primitive; this module is the policy
 * owner: it validates the key (by default at every encrypt/decrypt, so the
 * check runs wherever encryption runs rather than being re-implemented per
 * provider), encrypts on write, decrypts on read, and single-sources the
 * expiry rule.
 *
 * Plaintext is unrepresentable at the write boundary: `encryptTokens` is the
 * only sanctioned producer of token fields, and the model writers in
 * model/integrations.ts refuse to store a field that is not vault-shaped
 * ciphertext (see `assertEncryptedTokenFields`).
 */

import { encryptToken, decryptToken } from "../lib/encryption";

/** Token material exactly as a provider hands it over — never persisted. */
export interface PlaintextTokens {
  accessToken: string;
  refreshToken?: string;
}

/**
 * The encrypted token fields of an integrationConnections row, exactly as
 * persisted. Produced only by `encryptTokens`.
 */
export interface EncryptedTokenFields {
  encryptedAccessToken: string;
  accessTokenIv: string;
  accessTokenAuthTag: string;
  encryptedRefreshToken?: string;
  refreshTokenIv?: string;
  refreshTokenAuthTag?: string;
}

/** Structural views a stored connection row satisfies — Doc works directly. */
export type EncryptedAccessTokenFields = Pick<
  EncryptedTokenFields,
  "encryptedAccessToken" | "accessTokenIv" | "accessTokenAuthTag"
>;
export type EncryptedRefreshTokenFields = Pick<
  EncryptedTokenFields,
  "encryptedRefreshToken" | "refreshTokenIv" | "refreshTokenAuthTag"
>;

/**
 * Reads and validates TOKEN_ENCRYPTION_KEY. This is the default key source
 * for every vault operation, so key validation cannot be skipped by a call
 * site. Tests inject the key explicitly instead.
 */
export function getTokenEncryptionKey(): string {
  return assertValidEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY);
}

/** The pure format check behind getTokenEncryptionKey — returns the key when valid. */
export function assertValidEncryptionKey(key: string | undefined): string {
  if (!key) {
    throw new Error(
      "Missing TOKEN_ENCRYPTION_KEY environment variable. Set a 32-byte hex key."
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "Invalid TOKEN_ENCRYPTION_KEY. Expected 64 hex characters (32 bytes)."
    );
  }
  return key;
}

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

/**
 * The single source of the freshness rule: a token counts as valid only when
 * it outlives now plus a 60-second buffer, so a remote call never starts with
 * a token that expires mid-flight. `now` is injectable for tests.
 */
export function isAccessTokenFresh(
  expiresAt: number,
  now: number = Date.now()
): boolean {
  return expiresAt > now + TOKEN_EXPIRY_BUFFER_MS;
}

/**
 * Encrypt-on-write: the only sanctioned producer of token fields. Every write
 * site of the token columns (saveConnection, updateConnectionTokens) must be
 * fed from here. Refresh-token fields are emitted only when a refresh token
 * is given — and then always as a complete triple.
 */
export async function encryptTokens(
  tokens: PlaintextTokens,
  keyHex: string = getTokenEncryptionKey()
): Promise<EncryptedTokenFields> {
  const encAccess = await encryptToken(tokens.accessToken, keyHex);
  const fields: EncryptedTokenFields = {
    encryptedAccessToken: encAccess.ciphertext,
    accessTokenIv: encAccess.iv,
    accessTokenAuthTag: encAccess.authTag,
  };
  if (tokens.refreshToken !== undefined) {
    const encRefresh = await encryptToken(tokens.refreshToken, keyHex);
    fields.encryptedRefreshToken = encRefresh.ciphertext;
    fields.refreshTokenIv = encRefresh.iv;
    fields.refreshTokenAuthTag = encRefresh.authTag;
  }
  return fields;
}

/** Decrypt-on-read: the access token of a stored connection row. */
export async function decryptAccessToken(
  connection: EncryptedAccessTokenFields,
  keyHex: string = getTokenEncryptionKey()
): Promise<string> {
  return decryptToken(
    connection.encryptedAccessToken,
    connection.accessTokenIv,
    connection.accessTokenAuthTag,
    keyHex
  );
}

/**
 * Decrypt-on-read: the refresh token of a stored connection row. The refresh
 * fields are written all-or-nothing, so a missing piece means the connection
 * simply has no refresh token.
 */
export async function decryptRefreshToken(
  connection: EncryptedRefreshTokenFields,
  keyHex: string = getTokenEncryptionKey()
): Promise<string> {
  if (
    !connection.encryptedRefreshToken ||
    !connection.refreshTokenIv ||
    !connection.refreshTokenAuthTag
  ) {
    throw new Error("No refresh token available for this connection");
  }
  return decryptToken(
    connection.encryptedRefreshToken,
    connection.refreshTokenIv,
    connection.refreshTokenAuthTag,
    keyHex
  );
}

/**
 * The write-side tripwire. Token columns hold AES-GCM output, which
 * lib/encryption always renders as even-length lowercase hex — a plaintext
 * token (or a truncated ciphertext) fails this check, so a future writer
 * cannot smuggle plaintext into encryptedAccessToken through the model
 * writers. Refresh-token fields must additionally be all-or-nothing.
 */
export function assertEncryptedTokenFields(fields: EncryptedTokenFields): void {
  const named: Array<[string, string | undefined]> = [
    ["encryptedAccessToken", fields.encryptedAccessToken],
    ["accessTokenIv", fields.accessTokenIv],
    ["accessTokenAuthTag", fields.accessTokenAuthTag],
    ["encryptedRefreshToken", fields.encryptedRefreshToken],
    ["refreshTokenIv", fields.refreshTokenIv],
    ["refreshTokenAuthTag", fields.refreshTokenAuthTag],
  ];
  for (const [name, value] of named) {
    if (value !== undefined && !isHex(value)) {
      throw new Error(
        `${name} must be vault-produced ciphertext (lowercase hex); refusing to store possible plaintext`
      );
    }
  }

  const refreshFields = [
    fields.encryptedRefreshToken,
    fields.refreshTokenIv,
    fields.refreshTokenAuthTag,
  ];
  const present = refreshFields.filter((f) => f !== undefined).length;
  if (present !== 0 && present !== 3) {
    throw new Error(
      "Refresh token fields must be written all-or-nothing: encryptedRefreshToken, refreshTokenIv, refreshTokenAuthTag"
    );
  }
}

function isHex(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/.test(value);
}
