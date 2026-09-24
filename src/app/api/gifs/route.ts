import { after, NextResponse, type NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";

/**
 * GIF search for retro stickies: a thin proxy over GIPHY so the API key
 * stays on the server. Trending when there is no query. Signed-in sessions
 * only (guests included), so the endpoint is not an open proxy for the key.
 *
 * Without GIPHY_API_KEY the route answers `{ configured: false }` and the
 * picker falls back to pasting a link.
 *
 * GIPHY's beta keys allow 100 calls an hour. Every search is counted, by
 * the hour, in Convex's `gifSearchUsage` (`npx convex run gifUsage:recent`),
 * including the ones GIPHY refused for that limit.
 */

export interface GifResult {
  id: string;
  title: string;
  /** What the sticky shows: GIPHY's 200px-wide rendition. */
  url: string;
  width: number;
  height: number;
  /** What the picker grid shows: the 100px-wide rendition. */
  previewUrl: string;
}

export interface GifSearchResponse {
  configured: boolean;
  results: GifResult[];
  nextOffset?: number;
}

const PAGE_SIZE = 24;

const RATE_LIMITED = "GIF search has hit its hourly limit. Paste a GIPHY, Tenor or Imgur link instead, or try again later.";

/** Counts the search once the answer is sent, so counting never slows the picker or breaks it. */
function countSearch(rateLimited: boolean): void {
  after(async () => {
    try {
      await fetchAuthMutation(api.gifUsage.record, { rateLimited });
    } catch (error) {
      console.warn("[gifs] couldn't count a search", error);
    }
  });
}

interface GiphyRendition {
  url?: string;
  webp?: string;
  width?: string;
  height?: string;
}

interface GiphyGif {
  id: string;
  title?: string;
  images?: { fixed_width?: GiphyRendition; fixed_width_small?: GiphyRendition };
}

function toResult(gif: GiphyGif): GifResult | null {
  const main = gif.images?.fixed_width;
  if (!main?.url) return null;
  return {
    id: gif.id,
    title: gif.title?.trim() || "GIF",
    url: main.url,
    width: Number(main.width) || 200,
    height: Number(main.height) || 200,
    // The picker's grid loads a page of these at a time: WebP, where GIPHY
    // has it, is the same animation in far fewer bytes.
    previewUrl: gif.images?.fixed_width_small?.webp ?? gif.images?.fixed_width_small?.url ?? main.url,
  };
}

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Sign in to search GIFs" }, { status: 401 });
  }

  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false, results: [] } satisfies GifSearchResponse);
  }

  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 50) ?? "";
  const offset = Math.min(Math.max(Number(request.nextUrl.searchParams.get("offset")) || 0, 0), 4000);
  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    rating: "pg-13",
  });
  if (query) {
    params.set("q", query);
    params.set("lang", "en");
  }
  const endpoint = query ? "search" : "trending";

  try {
    const response = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`, {
      next: { revalidate: query ? 3600 : 600 },
    });
    // Only a 200 is cached, so a refusal reaches here every time.
    const rateLimited = response.status === 429;
    countSearch(rateLimited);
    if (rateLimited) {
      console.warn("[gifs] GIPHY refused a search: the key's hourly rate limit is used up");
      return NextResponse.json({ error: RATE_LIMITED, rateLimited: true }, { status: 429 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: "GIF search is unavailable right now" }, { status: 502 });
    }
    const body = (await response.json()) as {
      data?: GiphyGif[];
      pagination?: { total_count?: number; count?: number; offset?: number };
    };
    const results = (body.data ?? []).map(toResult).filter((r): r is GifResult => r !== null);
    const total = body.pagination?.total_count ?? 0;
    const next = offset + (body.pagination?.count ?? results.length);
    return NextResponse.json(
      {
        configured: true,
        results,
        ...(next < total && results.length > 0 ? { nextOffset: next } : {}),
      } satisfies GifSearchResponse,
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch {
    return NextResponse.json({ error: "GIF search is unavailable right now" }, { status: 502 });
  }
}
