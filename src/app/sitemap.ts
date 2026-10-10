import { MetadataRoute } from "next";
import { getPosts, type PostMeta } from "./(app)/blog/posts";
import { getLatestRelease } from "@/lib/changelog";
import { SITE_ORIGIN } from "@/lib/site-config";
import { INDEXED_PATHS, type IndexedPath } from "@/lib/page-metadata";

type Entry = MetadataRoute.Sitemap[number];

const modified = (post: PostMeta) => new Date(post.modifiedDate || post.date);

const urlOf = (path: string) => (path === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`);

/**
 * Every indexable page, as `PUBLIC_PATHS` decides. `lastModified` is set
 * only where a real date backs it: a date that is always the build time
 * tells crawlers nothing, so pages without a source for it leave it out.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();
  const latestRelease = getLatestRelease();
  // The changelog changes only with a release. Marketing pages change with
  // any merge, before the release that lists it, so they carry no date.
  const released = latestRelease ? new Date(latestRelease.date) : undefined;
  const newestPost =
    posts.length > 0
      ? new Date(Math.max(...posts.map((post) => modified(post).getTime())))
      : undefined;

  // Each indexable path's rank, change frequency and date; a post's own
  // date is its last change.
  const pages: Record<IndexedPath, Omit<Entry, "url">> = {
    "/": { changeFrequency: "weekly", priority: 1.0 },
    "/features": { changeFrequency: "monthly", priority: 0.8 },
    "/pricing": { changeFrequency: "monthly", priority: 0.7 },
    "/about": { changeFrequency: "monthly", priority: 0.7 },
    "/blog": { lastModified: newestPost, changeFrequency: "weekly", priority: 0.8 },
    "/blog/[slug]": { changeFrequency: "monthly", priority: 0.7 },
    "/changelog": { lastModified: released, changeFrequency: "weekly", priority: 0.5 },
    "/privacy": { changeFrequency: "yearly", priority: 0.3 },
    "/terms": { changeFrequency: "yearly", priority: 0.3 },
    "/refund-policy": { changeFrequency: "yearly", priority: 0.3 },
    "/room/new": { changeFrequency: "monthly", priority: 0.6 },
    "/retro/new": { changeFrequency: "monthly", priority: 0.6 },
  };

  return INDEXED_PATHS.flatMap((path): Entry[] =>
    path === "/blog/[slug]"
      ? posts.map((post) => ({
          url: urlOf(`/blog/${post.slug}`),
          lastModified: modified(post),
          ...pages[path],
        }))
      : [{ url: urlOf(path), ...pages[path] }],
  );
}
