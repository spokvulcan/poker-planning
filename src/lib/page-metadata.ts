import type { Metadata } from "next";
import { SITE } from "./site-copy";
import { siteConfig } from "./site-config";

type OpenGraph = NonNullable<Metadata["openGraph"]>;
type Twitter = NonNullable<Metadata["twitter"]>;

const OG_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: SITE.openGraph.imageAlt,
};

/** The Open Graph fields every page carries; `metadataBase` resolves the image. */
export const SITE_OPEN_GRAPH = {
  type: "website",
  locale: "en_US",
  siteName: siteConfig.name,
  images: [OG_IMAGE],
} satisfies OpenGraph;

/** The Twitter card every page carries. */
export const SITE_TWITTER = {
  card: "summary_large_image",
  images: [OG_IMAGE.url],
} satisfies Twitter;

/**
 * What search engines may do with a public path:
 * - `index`: index the page. The sitemap lists it, and its head carries its
 *   canonical URL and both social cards.
 * - `noindex`: read it, and keep it out of results.
 * - `disallow`: robots.txt keeps crawlers out, and the head says noindex too.
 */
export type Indexing = "index" | "noindex" | "disallow";

/**
 * Every public path and what search engines may do with it: the one list
 * that page heads (`pageMetadata`), the sitemap and robots.txt read, and
 * that `sitemap.test.ts` checks every page under `src/app` against.
 *
 * A dynamic segment such as `[slug]` stands for any value. An indexable path
 * decides its own page only; a noindex or disallowed one also decides the
 * pages under it, the way robots.txt reads a path.
 */
export const PUBLIC_PATHS = {
  "/": "index",
  "/features": "index",
  "/pricing": "index",
  "/about": "index",
  "/blog": "index",
  "/blog/[slug]": "index",
  "/changelog": "index",
  "/privacy": "index",
  "/terms": "index",
  "/refund-policy": "index",
  // The Start estimating and Start a retro pages.
  "/room/new": "index",
  "/retro/new": "index",
  // Sign-in, and the dashboard behind it.
  "/auth": "noindex",
  "/dashboard": "noindex",
  // A room is private to the people in it, and the demo simulates one.
  "/demo": "disallow",
  "/room/[roomId]": "disallow",
} as const satisfies Record<string, Indexing>;

const LISTED: Record<string, Indexing> = PUBLIC_PATHS;

/** A path search engines may index. */
export type IndexedPath = {
  [Path in keyof typeof PUBLIC_PATHS]: (typeof PUBLIC_PATHS)[Path] extends "index"
    ? Path
    : never;
}[keyof typeof PUBLIC_PATHS];

/** The indexable paths, in the list's order: the sitemap's pages. */
export const INDEXED_PATHS = Object.keys(LISTED).filter(
  (path): path is IndexedPath => LISTED[path] === "index",
);

/** Whether a listed path decides `path`, compared segment by segment. */
function decides(listed: string, path: string): boolean {
  const want = listed.split("/");
  const have = path.split("/");
  const fits =
    LISTED[listed] === "index" ? have.length === want.length : have.length >= want.length;
  return fits && want.every((segment, i) => segment === have[i] || segment.startsWith("["));
}

/**
 * What search engines may do with the page at `path`: its own entry
 * ("/room/new" before "/room/[roomId]"), else the deepest that decides it.
 * A path no entry decides is refused, so no page is indexed by default.
 */
export function indexingOf(path: string): Indexing {
  if (LISTED[path]) return LISTED[path];
  const decider = Object.keys(LISTED)
    .filter((listed) => decides(listed, path))
    .sort((a, b) => b.split("/").length - a.split("/").length)[0];
  if (!decider) {
    throw new Error(`${path} is not in PUBLIC_PATHS: decide whether search engines may index it`);
  }
  return LISTED[decider];
}

interface PageMetadataInput {
  /**
   * The document title; the root layout's template appends "| AgileKit" to a
   * string, and the cards are titled the same way.
   */
  title: string | { absolute: string };
  /** Required on an indexable page, whose cards carry it. */
  description?: string;
  /**
   * The page's path, e.g. "/about"; `metadataBase` makes it absolute. A
   * dynamic route's static metadata names its route ("/room/[roomId]"), and
   * a layout its section ("/auth").
   */
  path: string;
  /** The social cards' description, when it differs from the page's. */
  social?: { description: string };
  /** An article's dates; its author is the site's. */
  article?: { publishedTime: string; modifiedTime: string };
}

const NOINDEX = { index: false, follow: false };

/**
 * A public page's metadata, as `PUBLIC_PATHS` decides. A page search engines
 * may not index gets noindex and keeps the layout's cards. An indexable page
 * gets its canonical URL and both social cards: Next.js replaces a parent's
 * `openGraph` and `twitter` objects instead of merging them, so a page that
 * set only its Open Graph title and URL lost the image and site name, and
 * kept the homepage's Twitter title. The layout's title template reaches
 * only the document title, so the cards are titled here the way it titles
 * the document.
 */
export function pageMetadata({
  title,
  description,
  path,
  social,
  article,
}: PageMetadataInput): Metadata {
  if (indexingOf(path) !== "index") {
    // A `description` key set to undefined would drop the layout's.
    return { title, ...(description && { description }), robots: NOINDEX };
  }
  if (!description) throw new Error(`${path} is indexed: its cards need a description`);

  const card = {
    title:
      typeof title === "string"
        ? SITE.titleTemplate.replace("%s", title)
        : title.absolute,
    description: social?.description ?? description,
  };
  const openGraph: OpenGraph = article
    ? {
        ...SITE_OPEN_GRAPH,
        ...card,
        url: path,
        type: "article",
        ...article,
        authors: [siteConfig.author.name],
      }
    : { ...SITE_OPEN_GRAPH, ...card, url: path };

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph,
    twitter: { ...SITE_TWITTER, ...card },
  };
}
