/**
 * The edit-key store (ADR-0012): the keys an anonymous retro handed this
 * browser, one per card it wrote, kept in `localStorage` under the room id
 * (spec §8.1). Pure functions over a `Storage`, so the hook is thin and the
 * store is testable without a DOM. Every access is guarded: storage may be
 * absent, full or blocked, and the board must still render — then "mine"
 * is simply empty for this device.
 */

export type EditKeys = Readonly<Record<string, string>>;

/** A minimal storage: what `localStorage` offers, and what a test fakes. */
export type KeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const EDIT_KEYS_PREFIX = "retro-edit-keys:";

export const storageKeyFor = (roomId: string) => `${EDIT_KEYS_PREFIX}${roomId}`;

/** The room's keys by `clientId`; empty when there are none or storage is unreadable. */
export function readEditKeys(storage: KeyStorage | undefined, roomId: string): EditKeys {
  try {
    const raw = storage?.getItem(storageKeyFor(roomId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const keys: Record<string, string> = {};
    for (const [clientId, key] of Object.entries(parsed)) {
      if (typeof key === "string" && key) keys[clientId] = key;
    }
    return keys;
  } catch {
    return {};
  }
}

/** Writes the room's keys whole; a failure (quota, private mode) is swallowed. */
export function writeEditKeys(storage: KeyStorage | undefined, roomId: string, keys: EditKeys): void {
  try {
    if (Object.keys(keys).length === 0) {
      storage?.removeItem(storageKeyFor(roomId));
    } else {
      storage?.setItem(storageKeyFor(roomId), JSON.stringify(keys));
    }
  } catch {
    // Nothing to do: the key stays in memory for this page's life.
  }
}

/** The room's keys with one remembered. */
export function withEditKey(keys: EditKeys, clientId: string, editKey: string): EditKeys {
  return keys[clientId] === editKey ? keys : { ...keys, [clientId]: editKey };
}

/** The room's keys with one forgotten. */
export function withoutEditKey(keys: EditKeys, clientId: string): EditKeys {
  if (!(clientId in keys)) return keys;
  const { [clientId]: _dropped, ...rest } = keys;
  return rest;
}
