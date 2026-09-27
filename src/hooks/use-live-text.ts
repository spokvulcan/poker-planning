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
const trimmed = (value: string) => value.trim();

export interface LiveTextOptions {
  /** The server's value: whatever anyone last saved. */
  value: string;
  /**
   * Saves a value. A returned promise settles once the server has it, which
   * a Convex mutation does: it resolves after the query results that include
   * the write have arrived. Resolving to `false` (as `runAct` does) or
   * rejecting means it didn't land, and the field keeps what was typed.
   * Without it, the field only follows the server.
   */
  save?: (value: string) => unknown;
  /** Save this long after typing stops. Without it, typing is saved on `commit`. */
  autosaveMs?: number;
  /**
   * A name, say: spaces around it are no change and aren't saved, and it is
   * never saved blank. Committing a blank one reverts it.
   */
  required?: boolean;
}

export interface LiveText {
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
  /** What's typed can be saved: it's a change, and not blank where the value is required. */
  canCommit: boolean;
  /** Something typed here hasn't landed on the server yet. */
  unsaved: boolean;
}

/**
 * A text field over a value other people can change. It takes in the
 * server's value only while nothing typed here is unsaved; until then what's
 * typed wins, because taking in the server's copy would drop it and throw the
 * caret to the end, and the pending save overwrites the server's copy anyway.
 * A remote edit that lands while the field is focused keeps the caret next to
 * the text it was next to. A discussion note saves as it's typed; a name
 * saves when committed. Every field that edits shared text goes through here.
 *
 * Returns the field's state, and a ref to hand to its input or textarea so a
 * remote edit can keep the caret in place.
 */
export function useLiveText<E extends HTMLInputElement | HTMLTextAreaElement = HTMLTextAreaElement>({
  value,
  save,
  autosaveMs,
  required = false,
}: LiveTextOptions): [LiveText, RefObject<E | null>] {
  const normalize = required ? trimmed : same;
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
    async (typed: string): Promise<boolean> => {
      const next = normalize(typed);
      inFlight.current += 1;
      let landed = false;
      try {
        landed = (await saveRef.current?.(next)) !== false;
      } catch {
        landed = false;
      } finally {
        inFlight.current -= 1;
      }
      // Done once the last save has landed and nothing was typed since it left.
      if (landed && inFlight.current === 0 && timer.current === null && normalize(localRef.current) === next) {
        setUnsaved(false);
      }
      return landed;
    },
    [saveRef, localRef, normalize]
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

  const commit = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    queued.current = null;
    const next = normalize(localRef.current);
    if (required && !next) {
      revert();
      return false;
    }
    if (next === normalize(syncedRef.current)) {
      if (inFlight.current === 0) setUnsaved(false);
      return true;
    }
    return await send(next);
  }, [localRef, syncedRef, normalize, required, revert, send]);

  // A field that goes away with typing still queued saves it on the way out.
  useEffect(
    () => () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      if (queued.current !== null) void saveRef.current?.(normalize(queued.current));
    },
    [saveRef, normalize]
  );

  const dirty = normalize(local) !== normalize(synced);
  return [
    {
      value: local,
      setValue,
      commit,
      revert,
      dirty,
      canCommit: dirty && !(required && !normalize(local)),
      unsaved,
    },
    ref,
  ];
}
