/**
 * The one-click unsubscribe token (spec §16.4, ADR-0020):
 * `{userId}.{base64url(HMAC-SHA256(userId, UNSUBSCRIBE_SECRET))}`, no
 * expiry. Minted by the send action for every non-magic-link email and
 * verified by the unsubscribe mutation, which runs signed out and so can
 * trust nothing but the MAC. Web Crypto only, so it runs in the default
 * Convex runtime and under convex-test alike.
 */

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mac(userId: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(userId));
  return base64url(new Uint8Array(signature));
}

/** Constant-time equality over two strings of equal length; unequal lengths are unequal. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The deployment's `UNSUBSCRIBE_SECRET`, or a configuration error naming the fix. */
export function requireUnsubscribeSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error(
      "UNSUBSCRIBE_SECRET is not set. Set it with: npx convex env set UNSUBSCRIBE_SECRET <secret>"
    );
  }
  return secret;
}

export async function mintUnsubscribeToken(userId: string, secret: string): Promise<string> {
  return `${userId}.${await mac(userId, secret)}`;
}

/**
 * The user id the token names, when its MAC re-derives under `secret`;
 * null for anything else. Never throws on a malformed token.
 */
export async function verifyUnsubscribeToken(
  token: string,
  secret: string
): Promise<string | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const userId = token.slice(0, dot);
  const presented = token.slice(dot + 1);
  const expected = await mac(userId, secret);
  return timingSafeEqual(presented, expected) ? userId : null;
}
