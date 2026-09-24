import type { Metadata } from "next";
import { SITE } from "./site-copy";

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
  siteName: "AgileKit",
  images: [OG_IMAGE],
} satisfies OpenGraph;

/** The Twitter card every page carries. */
export const SITE_TWITTER = {
  card: "summary_large_image",
  images: [OG_IMAGE.url],
} satisfies Twitter;

interface PageMetadataInput {
  /** The document title; the root layout's template appends "| AgileKit" to a string. */
  title: string | { absolute: string };
  description: string;
  /** The page's path, e.g. "/about"; `metadataBase` makes it absolute. */
  path: string;
  /** The social cards' title, and their description when it differs from the page's. */
  social: { title: string; description?: string };
  /** An article's Open Graph fields. */
  article?: { publishedTime: string; modifiedTime: string; authors: string[] };
}

/**
 * Metadata for an indexable page: its canonical URL and both social cards.
 * Next.js replaces a parent's `openGraph` and `twitter` objects instead of
 * merging them, so a page that set only its Open Graph title and URL lost
 * the image and site name, and kept the homepage's Twitter title.
 */
export function pageMetadata({
  title,
  description,
  path,
  social,
  article,
}: PageMetadataInput): Metadata {
  const card = {
    title: social.title,
    description: social.description ?? description,
  };
  const openGraph: OpenGraph = article
    ? { ...SITE_OPEN_GRAPH, ...card, url: path, type: "article", ...article }
    : { ...SITE_OPEN_GRAPH, ...card, url: path };

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph,
    twitter: { ...SITE_TWITTER, ...card },
  };
}
