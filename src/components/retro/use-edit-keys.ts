"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readEditKeys, withEditKey, withoutEditKey, writeEditKeys, type EditKeys } from "./edit-keys";

/** What the board holds of its edit keys: the set to present, and the remember/forget pair. */
export interface EditKeyStore {
  /** Every key this browser holds for the room, for `retro.mine` (spec §9). Stable while unchanged. */
  keys: string[];
  /** The key for one card, to ride its edit, move or delete (ADR-0012). */
  keyOf: (clientId: string) => string | undefined;
  /** Keep the key a create returned; the store writes through to storage. */
  remember: (clientId: string, editKey: string) => void;
  /** Drop a deleted card's key. */
  forget: (clientId: string) => void;
}

function storageOf(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The edit keys of one room (ADR-0012, spec §8.1): read from `localStorage`
 * once per room, held in state, and written through whenever they change.
 * Keyed by room, so a browser that wrote in two retros presents each its
 * own. Renders fine with no storage at all — then the keys live for the
 * page.
 */
export function useEditKeys(roomId: string): EditKeyStore {
  const [byRoom, setByRoom] = useState<{ roomId: string; keys: EditKeys }>(() => ({
    roomId,
    keys: readEditKeys(storageOf(), roomId),
  }));
  // A room change re-reads; state adjusted during render, no effect.
  if (byRoom.roomId !== roomId) {
    setByRoom({ roomId, keys: readEditKeys(storageOf(), roomId) });
  }
  const keys = byRoom.roomId === roomId ? byRoom.keys : readEditKeys(storageOf(), roomId);

  // The write-through: storage follows state, so the updaters stay pure.
  // Writing back what was just read is a no-op by value.
  useEffect(() => {
    writeEditKeys(storageOf(), byRoom.roomId, byRoom.keys);
  }, [byRoom]);

  const update = useCallback(
    (change: (keys: EditKeys) => EditKeys) => {
      setByRoom((current) => {
        // A change addressed to a room the store has already left is dropped.
        if (current.roomId !== roomId) return current;
        const next = change(current.keys);
        return next === current.keys ? current : { roomId, keys: next };
      });
    },
    [roomId]
  );

  const remember = useCallback<EditKeyStore["remember"]>(
    (clientId, editKey) => update((current) => withEditKey(current, clientId, editKey)),
    [update]
  );
  const forget = useCallback<EditKeyStore["forget"]>(
    (clientId) => update((current) => withoutEditKey(current, clientId)),
    [update]
  );
  const keyOf = useCallback<EditKeyStore["keyOf"]>((clientId) => keys[clientId], [keys]);
  const list = useMemo(() => Object.values(keys), [keys]);

  return useMemo(() => ({ keys: list, keyOf, remember, forget }), [list, keyOf, remember, forget]);
}
