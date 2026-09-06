import type { Metadata } from "next";
import { getPosts } from "./posts";
import { PostCard } from "./components/post-card";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { siteConfig } from "@/lib/site-config";
import { BreadcrumbSchema } from "@/components/seo/structured-data";
import Link from "next/link";
import { Rss } from "lucide-react";

export const metadata: Metadata = {
  title: `Blog - ${siteConfig.name} | Planning Poker Tips & Agile Estimation Guides`,
  description:
    "Learn about planning poker, Scrum estimation techniques, and agile best practices. Free guides and tutorials from the AgileKit team.",
  openGraph: {
    title: `Blog - ${siteConfig.name} | Planning Poker Tips & Agile Estimation Guides`,
    description:
      "Learn about planning poker, Scrum estimation techniques, and agile best practices.",
    url: `${siteConfig.url}/blog`,
  },
  alternates: {
    canonical: `${siteConfig.url}/blog`,
    types: {
      "application/rss+xml": "/blog/rss.xml",
      "application/atom+xml": "/blog/atom.xml",
    },
  },
};

export default async function BlogPage() {
  const posts = await getPosts();

  const breadcrumbItems = [
    { name: "Home", url: siteConfig.url },
    { name: "Blog", url: `${siteConfig.url}/blog` },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black">
      <BreadcrumbSchema items={breadcrumbItems} />
      <Navbar />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 pt-32 pb-16 sm:pt-40">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Blog
              </h1>
              <p className="mt-2 text-muted-foreground">
                {siteConfig.blog.description}
              </p>
            </div>
            <Link
              href="/blog/rss.xml"
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-gray-100 dark:hover:bg-surface-2 transition-colors"
              title="RSS Feed"
            >
              <Rss className="w-4 h-4" />
              <span className="hidden sm:inline">RSS</span>
            </Link>
          </div>

          {posts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">
                No posts yet. Check back soon!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {posts.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
