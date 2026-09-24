import { MetadataRoute } from "next";
import { getPosts, type PostMeta } from "./blog/posts";
import { getLatestRelease } from "@/lib/changelog";
import { SITE_ORIGIN } from "@/lib/site-config";

const modified = (post: PostMeta) => new Date(post.modifiedDate || post.date);

/**
 * Every indexable page. `lastModified` is set only where a real date backs
 * it: a date that is always the build time tells crawlers nothing, so pages
 * without a source for it leave it out.
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

  return [
    {
      url: SITE_ORIGIN,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_ORIGIN}/features`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_ORIGIN}/pricing`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_ORIGIN}/about`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_ORIGIN}/blog`,
      lastModified: newestPost,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...posts.map((post) => ({
      url: `${SITE_ORIGIN}/blog/${post.slug}`,
      lastModified: modified(post),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: `${SITE_ORIGIN}/changelog`,
      lastModified: released,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${SITE_ORIGIN}/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_ORIGIN}/terms`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_ORIGIN}/refund-policy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
