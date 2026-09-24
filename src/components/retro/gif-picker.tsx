"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Link2, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalizeGifUrl } from "@/convex/retroRules";
import type { Gif } from "@/convex/model/retro";
import type { GifResult, GifSearchResponse } from "@/app/api/gifs/route";
import { trackGifEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** Quick searches for the moods a retro runs into. */
const SUGGESTIONS = ["this is fine", "celebrate", "facepalm", "mind blown", "shipped", "coffee", "high five"];

/** Loads an image to learn its size, for a pasted link. */
function measure(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("That link didn't load as an image."));
    img.src = url;
  });
}

interface GifPickerProps {
  onPick: (gif: Gif) => void;
}

/**
 * Picks a GIF for a sticky: GIPHY search (trending until you type), or a
 * pasted GIPHY, Tenor or Imgur link. Rendered inside a popover; the
 * `data-gif-picker` mark tells the sticky editor that focus moving here is
 * not the end of an edit.
 */
export function GifPicker({ onPick }: GifPickerProps): ReactElement {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [nextOffset, setNextOffset] = useState<number | undefined>(undefined);
  const [configured, setConfigured] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const request = useRef(0);

  const search = useCallback(async (q: string, offset = 0) => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    if (q && offset === 0) trackGifEvent("gif_search");
    try {
      const params = new URLSearchParams({ q, offset: String(offset) });
      const response = await fetch(`/api/gifs?${params}`);
      const body = (await response.json()) as GifSearchResponse & { error?: string; rateLimited?: boolean };
      if (id !== request.current) return;
      if (body.rateLimited) {
        // GIPHY's hourly limit is used up: a pasted link still works.
        trackGifEvent("gif_search_limited");
        setPasting(true);
      }
      if (!response.ok) throw new Error(body.error ?? "GIF search is unavailable right now");
      setConfigured(body.configured);
      if (!body.configured) setPasting(true);
      setResults((previous) => (offset === 0 ? body.results : [...previous, ...body.results]));
      setNextOffset(body.nextOffset);
    } catch (e) {
      if (id !== request.current) return;
      setError(e instanceof Error ? e.message : "GIF search is unavailable right now");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  // Trending on open, then search as the person types (debounced).
  useEffect(() => {
    const timer = setTimeout(() => void search(query.trim()), query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [query, search]);

  const addLink = async () => {
    const url = normalizeGifUrl(link);
    if (!url) {
      setLinkError("Paste a GIPHY, Tenor or Imgur link (https).");
      return;
    }
    try {
      const size = await measure(url);
      trackGifEvent("gif_pick", { source: "link" });
      onPick({ url, ...size });
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "That link didn't load.");
    }
  };

  return (
    <div data-gif-picker className="flex flex-col gap-2.5" data-testid="gif-picker">
      {configured !== false && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIPHY"
            aria-label="Search GIFs"
            className="pl-8"
          />
        </div>
      )}

      {configured !== false && !query && (
        <div className="flex flex-wrap gap-1">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setQuery(suggestion)}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-gray-200 hover:text-foreground dark:hover:bg-surface-3"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {configured !== false && (
        <div className="nowheel -mx-1 h-64 overflow-y-auto px-1">
          {error ? (
            <p className="py-8 text-center text-xs text-muted-foreground">{error}</p>
          ) : results.length === 0 && !loading ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No GIFs for that. Try another word.</p>
          ) : (
            <div className="columns-3 gap-1.5">
              {results.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => {
                    trackGifEvent("gif_pick", { source: "search" });
                    onPick({ url: gif.url, width: gif.width, height: gif.height, title: gif.title });
                  }}
                  className="mb-1.5 block w-full overflow-hidden rounded-md ring-blue-500 transition-transform hover:ring-2 focus-visible:ring-2 focus-visible:outline-none active:scale-95"
                  title={gif.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote GIFs, sized by GIPHY */}
                  <img
                    src={gif.previewUrl}
                    alt={gif.title}
                    loading="lazy"
                    className="block w-full bg-muted"
                    style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
                  />
                </button>
              ))}
            </div>
          )}
          {loading && (
            <div className="flex justify-center py-3">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && nextOffset !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => void search(query.trim(), nextOffset)}
            >
              More
            </Button>
          )}
        </div>
      )}

      {pasting ? (
        <div className="space-y-1.5">
          {configured === false && (
            <p className="text-xs text-muted-foreground">
              Paste a link to a GIF from GIPHY, Tenor or Imgur.
            </p>
          )}
          <div className="flex gap-1.5">
            <Input
              autoFocus={configured === false}
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addLink();
                }
              }}
              placeholder="https://giphy.com/gifs/…"
              aria-label="GIF link"
              aria-invalid={!!linkError}
            />
            <Button size="default" onClick={() => void addLink()} disabled={!link.trim()}>
              Add
            </Button>
          </div>
          {linkError && <p className="text-xs text-destructive">{linkError}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPasting(true)}
          className="flex items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Link2 className="size-3.5" />
          Paste a link instead
        </button>
      )}

      {configured && (
        <p className={cn("text-right text-[10px] font-medium tracking-wide text-muted-foreground uppercase")}>
          Powered by GIPHY
        </p>
      )}
    </div>
  );
}
