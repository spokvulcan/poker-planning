"use client";

/**
 * PROTOTYPE, throwaway: flips a page between UI variants through `?variant=`.
 * Never shown in a production build. Delete with the prototype it serves.
 */

import { useEffect, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const CHANGED = "prototype-variant";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** The `?variant=` key, when it names one of `keys`; otherwise `fallback`. */
export function usePrototypeVariant(keys: readonly string[], fallback: string): string {
  const raw = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get("variant"),
    () => null
  );
  if (process.env.NODE_ENV === "production") return fallback;
  return raw && keys.includes(raw) ? raw : fallback;
}

function setVariant(key: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(CHANGED));
}

export interface PrototypeVariant {
  key: string;
  name: string;
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: readonly PrototypeVariant[];
  current: string;
}) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );
  const step = (by: number) => setVariant(variants[(index + by + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented) return;
      if (target?.closest("input, textarea, [contenteditable], [role=radiogroup]")) return;
      step(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  const variant = variants[index];
  return (
    <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 p-1 text-sm font-medium text-white shadow-2xl ring-4 ring-fuchsia-600/25">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => step(-1)}
        className="grid size-8 place-items-center rounded-full hover:bg-white/20"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 px-2 text-center whitespace-nowrap">
        <span className="font-mono">{variant.key === "current" ? "—" : variant.key}</span> · {variant.name}
        <span className="ml-2 text-white/60 tabular-nums">
          {index + 1}/{variants.length}
        </span>
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => step(1)}
        className="grid size-8 place-items-center rounded-full hover:bg-white/20"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
