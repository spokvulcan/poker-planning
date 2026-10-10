/**
 * A page's head as `PUBLIC_PATHS` decides it. Every indexable page carries
 * its own canonical and both social cards, titled like the document:
 * Next.js replaces a parent's `openGraph` and `twitter` instead of merging
 * them, so a page that set only its title and URL lost the image and kept
 * the homepage's Twitter card. Any other page says noindex.
 */
import { describe, it, expect } from "vitest";
import { indexingOf, pageMetadata } from "./page-metadata";

describe("pageMetadata", () => {
  const metadata = pageMetadata({
    title: "Pricing",
    description: "What AgileKit costs.",
    path: "/pricing",
  });

  it("names the page's own path as canonical", () => {
    expect(metadata.alternates?.canonical).toBe("/pricing");
  });

  it("titles both cards the way the root layout's template titles the document", () => {
    expect(metadata.openGraph?.title).toBe("Pricing | AgileKit");
    expect(metadata.twitter?.title).toBe("Pricing | AgileKit");
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

  it("titles the cards of a page with an absolute title with that title alone", () => {
    const about = pageMetadata({
      title: { absolute: "About AgileKit" },
      description: "Who builds AgileKit.",
      path: "/about",
    });
    expect(about.openGraph?.title).toBe("About AgileKit");
    expect(about.twitter?.title).toBe("About AgileKit");
  });

  it("gives the cards their own description when the page has one", () => {
    const changelog = pageMetadata({
      title: "Changelog",
      description: "Every release of AgileKit, newest first.",
      path: "/changelog",
      social: { description: "What's new in AgileKit." },
    });
    expect(changelog.description).toBe("Every release of AgileKit, newest first.");
    expect(changelog.openGraph?.description).toBe("What's new in AgileKit.");
    expect(changelog.twitter?.description).toBe("What's new in AgileKit.");
  });

  it("refuses an indexable page with no description for its cards", () => {
    expect(() => pageMetadata({ title: "Pricing", path: "/pricing" })).toThrow("/pricing");
  });

  it("makes an article's card an article with its dates, by the site's author", () => {
    const post = pageMetadata({
      title: "Story Points vs Hours",
      description: "Which to use.",
      path: "/blog/story-points-vs-hours",
      article: { publishedTime: "2025-01-08", modifiedTime: "2025-01-08" },
    });
    expect(post.openGraph).toMatchObject({
      type: "article",
      title: "Story Points vs Hours | AgileKit",
      publishedTime: "2025-01-08",
      authors: ["AgileKit Team"],
      siteName: "AgileKit",
      images: [expect.objectContaining({ url: "/og-image.png" })],
    });
  });
});

describe("pageMetadata for a page search engines may not index", () => {
  it("tells crawlers neither to index it nor to follow its links", () => {
    expect(pageMetadata({ title: "Demo", path: "/demo" }).robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("keeps its title and description, with no canonical or cards of its own", () => {
    expect(
      pageMetadata({
        title: "Analytics Dashboard",
        description: "Your estimation sessions.",
        path: "/dashboard",
      }),
    ).toEqual({
      title: "Analytics Dashboard",
      description: "Your estimation sessions.",
      robots: { index: false, follow: false },
    });
  });

  // Next.js reads a `description` key set to undefined as no description,
  // dropping the layout's.
  it("leaves the description to the layout when it has none", () => {
    expect("description" in pageMetadata({ title: "Demo", path: "/demo" })).toBe(false);
  });
});

describe("indexingOf", () => {
  it("decides the pages under a noindex or disallowed path the same way", () => {
    expect(indexingOf("/dashboard/sessions")).toBe("noindex");
    expect(indexingOf("/auth/signin")).toBe("noindex");
    expect(indexingOf("/demo/anything")).toBe("disallow");
  });

  it("reads a dynamic segment as any value, and as itself in a route", () => {
    expect(indexingOf("/room/k57abc")).toBe("disallow");
    expect(indexingOf("/room/[roomId]")).toBe("disallow");
    expect(indexingOf("/blog/story-points-vs-hours")).toBe("index");
  });

  it("decides a page by its own entry before a dynamic one, as Next.js routes it", () => {
    expect(indexingOf("/room/new")).toBe("index");
  });

  it("refuses a path no entry decides; an indexable page decides only itself", () => {
    expect(() => indexingOf("/nowhere")).toThrow("/nowhere");
    expect(() => indexingOf("/pricing/annual")).toThrow("/pricing/annual");
  });
});
