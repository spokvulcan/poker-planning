import { Feed } from "feed";
import { getPosts } from "../posts";
import { siteConfig } from "@/lib/site-config";

// Revalidate every hour
export const revalidate = 3600;

export async function GET() {
  const posts = await getPosts();

  const feed = new Feed({
    title: siteConfig.blog.title,
    description: siteConfig.blog.description,
    id: siteConfig.url,
    link: siteConfig.url,
    language: "en",
    favicon: `${siteConfig.url}/logo-64.png`,
    copyright: `All rights reserved ${new Date().getFullYear()}, ${siteConfig.name}`,
    feedLinks: {
      rss2: `${siteConfig.url}/blog/rss.xml`,
      atom: `${siteConfig.url}/blog/atom.xml`,
    },
    author: {
      name: siteConfig.author.name,
      link: siteConfig.url,
    },
  });

  posts.forEach((post) => {
    feed.addItem({
      title: post.title,
      id: `${siteConfig.url}/blog/${post.slug}`,
      link: `${siteConfig.url}/blog/${post.slug}`,
      description: post.spoiler,
      date: new Date(post.date),
      author: [
        {
          name: siteConfig.author.name,
          link: siteConfig.url,
        },
      ],
    });
  });

  return new Response(feed.rss2(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
