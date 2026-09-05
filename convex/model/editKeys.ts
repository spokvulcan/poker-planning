import type { Doc } from "../_generated/dataModel";

/**
 * Edit keys (ADR-0012): the browser-held capability that makes an
 * anonymous card its writer's. The server mints one per card, stores only
 * its SHA-256 and returns the plaintext once; the client keeps it and
 * presents it to read, edit, move or delete. Its own module so the card
 * model and the board read share one hash without an import cycle.
 */

/** How many random bytes an edit key carries: 128 bits, hex-encoded. */
const EDIT_KEY_BYTES = 16;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A fresh edit key: random, unguessable, returned to the writer once. */
export function mintEditKey(): string {
  const bytes = new Uint8Array(EDIT_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** What the row stores of a key: its SHA-256, hex. */
export async function hashEditKey(editKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(editKey));
  return toHex(new Uint8Array(digest));
}

/** The hashes of a presented key set, for matching against rows. */
export async function hashEditKeys(editKeys: readonly string[]): Promise<Set<string>> {
  return new Set(await Promise.all(editKeys.map(hashEditKey)));
}

/** Whether a presented key opens a keyed card. A card without a hash is never opened by a key. */
export async function editKeyOpens(
  card: Pick<Doc<"retroCards">, "editKeyHash">,
  editKey: string | undefined
): Promise<boolean> {
  if (card.editKeyHash === undefined || editKey === undefined) return false;
  return (await hashEditKey(editKey)) === card.editKeyHash;
}
