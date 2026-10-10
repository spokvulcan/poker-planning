/**
 * What crawlers are handed. One walk over every page under `src/app` checks
 * it against `PUBLIC_PATHS`: each page is decided there, each indexable one
 * is in the sitemap, and robots.txt keeps crawlers out of the disallowed
 * ones only. The sitemap and robots name only the production origin, and no
 * post sits under `public/`, where its folder made Vercel answer
 * `/blog/<slug>` with the raw Markdown.
 */
import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import sitemap from "./sitemap";
import robots from "./robots";
import { getAllSlugs } from "./(app)/blog/posts";
import { SITE_ORIGIN } from "@/lib/site-config";
import { indexingOf, INDEXED_PATHS } from "@/lib/page-metadata";

const APP_DIR = path.join(process.cwd(), "src", "app");

/**
 * The route of every page under `src/app`. A route group's folder adds no
 * segment, and a private folder's pages are not routes.
 */
function pageRoutes(dir = APP_DIR, route = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return /^page\.[jt]sx?$/.test(entry.name) ? [route || "/"] : [];
    if (entry.name.startsWith("_")) return [];
    const segment = /^\(.+\)$/.test(entry.name) ? "" : `/${entry.name}`;
    return pageRoutes(path.join(dir, entry.name), route + segment);
  });
}

/** The pages an indexable path stands for: one per post for a post's path. */
async function pagesOf(listed: string): Promise<string[]> {
  if (listed === "/blog/[slug]") return (await getAllSlugs()).map((slug) => `/blog/${slug}`);
  return [listed];
}

const urlOf = (page: string) => (page === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${page}`);

/**
 * Whether robots.txt lets a crawler fetch `page` (RFC 9309): the longest
 * matching rule wins, and Allow wins a tie.
 */
function crawlable(page: string): boolean {
  const [rule] = [robots().rules].flat();
  const longest = (rules: string | string[] | undefined) =>
    Math.max(-1, ...[rules ?? []].flat().filter((r) => page.startsWith(r)).map((r) => r.length));
  return longest(rule.allow) >= longest(rule.disallow);
}

describe("every public page", () => {
  const routes = pageRoutes();

  it("is found by walking src/app", () => {
    expect(routes).toEqual(expect.arrayContaining(["/", "/pricing", "/blog/[slug]", "/auth/signin"]));
  });

  it.each(routes)("%s is decided in PUBLIC_PATHS", (route) => {
    expect(() => indexingOf(route)).not.toThrow();
  });

  it.each(INDEXED_PATHS)("%s, indexable, is a page the app serves and in the sitemap", async (listed) => {
    expect(routes).toContain(listed);
    const urls = (await sitemap()).map((entry) => entry.url);
    const pages = await pagesOf(listed);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) expect(urls).toContain(urlOf(page));
  });

  it("is in the sitemap only if indexable", async () => {
    for (const { url } of await sitemap()) {
      const page = url === SITE_ORIGIN ? "/" : url.slice(SITE_ORIGIN.length);
      expect(indexingOf(page), url).toBe("index");
    }
  });

  // A dynamic segment is read as one value of it: "/room/[roomId]" as a room.
  it.each(routes)("%s is open to crawlers unless it is disallowed", (route) => {
    const page = route.replace(/\[[^\]]+\]/g, "k57a1b2c3");
    expect(crawlable(page)).toBe(indexingOf(route) !== "disallow");
  });
});

describe("the sitemap", () => {
  it("lists every page on the production origin", async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      expect(entry.url === SITE_ORIGIN || entry.url.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
    }
  });

  it("dates only what has a date, never the build time", async () => {
    const before = Date.now() - 60_000;
    for (const entry of await sitemap()) {
      if (entry.lastModified === undefined) continue;
      expect(new Date(entry.lastModified).getTime()).toBeLessThan(before);
    }
  });
});

describe("the posts", () => {
  it("live outside public/, so no static file shadows a post's page", () => {
    expect(fs.existsSync(path.join(process.cwd(), "public", "blog"))).toBe(false);
  });
});

describe("robots", () => {
  it("keeps crawlers out of rooms but lets them read the Start estimating page", () => {
    const [rule] = [robots().rules].flat();
    expect(rule.disallow).toContain("/room/");
    expect(rule.allow).toContain("/room/new");
    expect(robots().sitemap).toBe(`${SITE_ORIGIN}/sitemap.xml`);
  });
});
