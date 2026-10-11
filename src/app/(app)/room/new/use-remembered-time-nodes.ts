"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { TimeNodesShown } from "@/components/room/types";

/** Where this browser keeps the time nodes its last new room showed. */
const STORAGE_KEY = "agilekit:new-room:time-nodes";
/** Fired on this page's own writes, which `storage` events skip. */
const CHANGED = "agilekit:new-room:time-nodes-changed";

/** A new room's time nodes when nothing is remembered: the timer, and no session time. */
export const DEFAULT_TIME_NODES: TimeNodesShown = { timer: true, sessionTime: false };

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked: nothing remembered
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function parse(raw: string | null): TimeNodesShown {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (value && typeof value === "object" && "timer" in value && "sessionTime" in value) {
      const { timer, sessionTime } = value as Record<string, unknown>;
      if (typeof timer === "boolean" && typeof sessionTime === "boolean") return { timer, sessionTime };
    }
  } catch {
    // a value someone else wrote: fall back
  }
  return DEFAULT_TIME_NODES;
}

/**
 * The time nodes a new room shows (ADR-0032), remembered in this browser as
 * the next room's defaults. The server render and the hydrating one read the
 * defaults; the remembered choice follows straight after.
 */
export function useRememberedTimeNodes(): [TimeNodesShown, (next: TimeNodesShown) => void] {
  const raw = useSyncExternalStore(subscribe, readStored, () => null);
  const stored = useMemo(() => parse(raw), [raw]);
  // This page's pick wins, so the switches move even where storage is blocked.
  const [picked, setPicked] = useState<TimeNodesShown | null>(null);
  const remember = useCallback((next: TimeNodesShown) => {
    setPicked(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage blocked: the choice holds for this room only
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return [picked ?? stored, remember];
}
