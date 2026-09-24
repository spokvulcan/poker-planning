/**
 * Every indexable page carries its own canonical and both social cards:
 * Next.js replaces a parent's `openGraph` and `twitter` instead of merging
 * them, so a page that set only its title and URL lost the image and kept
 * the homepage's Twitter card.
 */
import { describe, it, expect } from "vitest";
import { pageMetadata } from "./page-metadata";

describe("pageMetadata", () => {
  const metadata = pageMetadata({
    title: "Pricing",
    description: "What AgileKit costs.",
    path: "/pricing",
    social: { title: "Pricing | AgileKit" },
  });

  it("names the page's own path as canonical", () => {
    expect(metadata.alternates?.canonical).toBe("/pricing");
  });

  it("gives the Open Graph card the site's image and name with the page's title", () => {
    expect(metadata.openGraph).toMatchObject({
      url: "/pricing",
      siteName: "AgileKit",
      type: "website",
      title: "Pricing | AgileKit",
      description: "What AgileKit costs.",
      images: [expect.objectContaining({ url: "/og-image.png", width: 1200, height: 630 })],
    });
  });

  it("gives the Twitter card the page's title, not the homepage's", () => {
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Pricing | AgileKit",
      description: "What AgileKit costs.",
      images: ["/og-image.png"],
    });
  });

  it("makes an article's card an article with its dates", () => {
    const post = pageMetadata({
      title: "Story Points vs Hours",
      description: "Which to use.",
      path: "/blog/story-points-vs-hours",
      social: { title: "Story Points vs Hours" },
      article: { publishedTime: "2025-01-08", modifiedTime: "2025-01-08", authors: ["AgileKit Team"] },
    });
    expect(post.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2025-01-08",
      siteName: "AgileKit",
      images: [expect.objectContaining({ url: "/og-image.png" })],
    });
  });
});
