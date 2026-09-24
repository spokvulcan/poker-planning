/**
 * What crawlers are handed: the sitemap and robots name only the production
 * origin, every post is listed, and no post sits under `public/`, where its
 * folder made Vercel answer `/blog/<slug>` with the raw Markdown.
 */
import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import sitemap from "./sitemap";
import robots from "./robots";
import { getAllSlugs } from "./blog/posts";
import { SITE_ORIGIN } from "@/lib/site-config";

describe("the sitemap", () => {
  it("lists every page on the production origin", async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      expect(entry.url === SITE_ORIGIN || entry.url.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
    }
  });

  it("lists every blog post", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    const slugs = await getAllSlugs();
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) expect(urls).toContain(`${SITE_ORIGIN}/blog/${slug}`);
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
