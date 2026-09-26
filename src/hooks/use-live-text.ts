"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useLatest } from "./use-latest";

/**
 * Where `index` in `before` lands in `after`, treating the difference as one
 * contiguous edit: an index ahead of the edit stays put, one past it keeps
 * its distance from the end.
 */
export function rebaseIndex(before: string, after: string, index: number): number {
  const shorter = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shorter && before[prefix] === after[prefix]) prefix++;
  if (index <= prefix) return index;
  return Math.max(prefix, after.length - (before.length - index));
}

const same = (value: string) => value;

export interface LiveTextOptions {
  /** The server's value: whatever anyone last saved. */
  value: string;
  /**
   * Saves a value. A returned promise settles once the server has it, which
   * a Convex mutation does: it resolves after the query results that include
   * the write have arrived. Without it, the field only follows the server.
   */
  save?: (value: string) => unknown;
  /** Save this long after typing stops. Without it, typing is saved on `commit`. */
  autosaveMs?: number;
  /** What counts as no change (a trimmed name, say). A stable function. */
  normalize?: (value: string) => string;
}

export interface LiveText<E extends HTMLInputElement | HTMLTextAreaElement> {
  /** What the field shows. */
  value: string;
  /** The field's onChange. */
  setValue: (value: string) => void;
  /** Saves what's typed now (Save, Enter, blur). Resolves to whether it landed. */
  commit: () => Promise<boolean>;
  /** Drops what's typed and shows the server's value (Escape). */
  revert: () => void;
  /** What's typed differs from the server's value. */
  dirty: boolean;
  /** Something typed here hasn't landed on the server yet. */
  unsaved: boolean;
  /** Hand to the input or textarea, so a remote edit keeps the caret next to its text. */
  ref: RefObject<E | null>;
}

/**
 * A text field over a value other people can change. It takes in the
 * server's value only while nothing typed here is unsaved; until then what's
 * typed wins, because taking in the server's copy would drop it and throw the
 * caret to the end, and the pending save overwrites the server's copy anyway.
 * A remote edit that lands while the field is focused keeps the caret next to
 * the text it was next to. A discussion note saves as it's typed; a name
 * saves when committed. Every field that edits shared text goes through here.
 */
export function useLiveText<E extends HTMLInputElement | HTMLTextAreaElement = HTMLTextAreaElement>({
  value,
  save,
  autosaveMs,
  normalize = same,
}: LiveTextOptions): LiveText<E> {
  const [local, setLocal] = useState(value);
  // The server value the field last took in. Only a change to it is an edit to take in.
  const [synced, setSynced] = useState(value);
  // From the first keystroke until what was typed has landed.
  const [unsaved, setUnsaved] = useState(false);
  const ref = useRef<E>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<string | null>(null);
  const inFlight = useRef(0);
  const selectionAfterSync = useRef<[number, number] | null>(null);
  const saveRef = useLatest(save);
  const localRef = useLatest(local);
  const syncedRef = useLatest(synced);
  const valueRef = useLatest(value);

  useEffect(() => {
    if (unsaved || value === synced) return;
    setSynced(value);
    if (value === local) return;
    const field = ref.current;
    if (field && field === document.activeElement && field.selectionStart !== null) {
      selectionAfterSync.current = [
        rebaseIndex(local, value, field.selectionStart),
        rebaseIndex(local, value, field.selectionEnd ?? field.selectionStart),
      ];
    }
    setLocal(value);
  }, [value, synced, unsaved, local]);

  // Keep the caret next to the text it was next to before a remote edit.
  useLayoutEffect(() => {
    const selection = selectionAfterSync.current;
    if (!selection) return;
    selectionAfterSync.current = null;
    ref.current?.setSelectionRange(...selection);
  }, [local]);

  const send = useCallback(
    async (next: string): Promise<boolean> => {
      inFlight.current += 1;
      let landed = false;
      try {
        await saveRef.current?.(next);
        landed = true;
      } catch {
        landed = false;
      } finally {
        inFlight.current -= 1;
      }
      // Done once the last save has landed and nothing was typed since it left.
      if (landed && inFlight.current === 0 && timer.current === null && localRef.current === next) {
        setUnsaved(false);
      }
      return landed;
    },
    [saveRef, localRef]
  );

  const setValue = useCallback(
    (next: string) => {
      setLocal(next);
      setUnsaved(true);
      if (autosaveMs === undefined) return;
      queued.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const text = queued.current;
        queued.current = null;
        if (text !== null) void send(text);
      }, autosaveMs);
    },
    [autosaveMs, send]
  );

  const commit = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    queued.current = null;
    const next = localRef.current;
    if (normalize(next) === normalize(syncedRef.current)) {
      if (inFlight.current === 0) setUnsaved(false);
      return true;
    }
    return await send(next);
  }, [localRef, syncedRef, normalize, send]);

  const revert = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    queued.current = null;
    setLocal(valueRef.current);
    setSynced(valueRef.current);
    setUnsaved(false);
  }, [valueRef]);

  // A field that goes away with typing still queued saves it on the way out.
  useEffect(
    () => () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      if (queued.current !== null) void saveRef.current?.(queued.current);
    },
    [saveRef]
  );

  return {
    value: local,
    setValue,
    commit,
    revert,
    dirty: normalize(local) !== normalize(synced),
    unsaved,
    ref,
  };
}
