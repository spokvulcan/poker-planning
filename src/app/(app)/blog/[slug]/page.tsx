import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote-client/rsc";
import remarkGfm from "remark-gfm";
import remarkSmartypants from "remark-smartypants";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import {
  getPostBySlug,
  getAllSlugs,
  getPosts,
  getTableOfContents,
  getRelatedPosts,
  formatDate,
} from "../posts";
import { mdxComponents } from "../components/mdx-components";
import { TableOfContents } from "../components/table-of-contents";
import { RelatedPosts } from "../components/related-posts";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { siteConfig } from "@/lib/site-config";
import { pageMetadata } from "@/lib/page-metadata";
import {
  BlogPostingSchema,
  BreadcrumbSchema,
} from "@/components/seo/structured-data";
import Link from "next/link";
import { ArrowLeft, Clock, Calendar } from "lucide-react";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post Not Found",
    };
  }

  return pageMetadata({
    title: post.title,
    description: post.spoiler,
    path: `/blog/${slug}`,
    social: { title: post.title },
    article: {
      publishedTime: post.date,
      modifiedTime: post.modifiedDate || post.date,
      authors: [siteConfig.author.name],
    },
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const toc = getTableOfContents(post.content);
  const allPosts = await getPosts();
  const relatedPosts = await getRelatedPosts(post, allPosts);

  const breadcrumbItems = [
    { name: "Home", url: siteConfig.url },
    { name: "Blog", url: `${siteConfig.url}/blog` },
    { name: post.title, url: `${siteConfig.url}/blog/${slug}` },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black">
      <BlogPostingSchema
        title={post.title}
        description={post.spoiler}
        datePublished={post.date}
        dateModified={post.modifiedDate}
        slug={slug}
        wordCount={post.wordCount}
      />
      <BreadcrumbSchema items={breadcrumbItems} />
      <Navbar />
      <main className="flex-1">
        <article className="max-w-6xl mx-auto px-6 pt-32 pb-16 sm:pt-40">
          {/* Back link */}
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>

          <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-12">
            {/* Main content */}
            <div className="max-w-3xl">
              {/* Header */}
              <header className="mb-10">
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white leading-tight">
                  {post.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {formatDate(post.date)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {post.readingTime}
                  </span>
                </div>

                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </header>

              {/* MDX Content */}
              <div className="prose-custom">
                <MDXRemote
                  source={post.content}
                  components={mdxComponents}
                  options={{
                    mdxOptions: {
                      remarkPlugins: [remarkGfm, remarkSmartypants],
                      rehypePlugins: [
                        rehypeSlug,
                        [
                          rehypeAutolinkHeadings,
                          {
                            behavior: "wrap",
                            properties: {
                              className: ["anchor-link"],
                            },
                          },
                        ],
                        [
                          rehypePrettyCode,
                          {
                            theme: {
                              dark: "github-dark",
                              light: "github-light",
                            },
                            keepBackground: false, // Let CSS handle backgrounds for theme switching
                          },
                        ],
                      ],
                    },
                  }}
                />
              </div>

              {/* Related posts */}
              <RelatedPosts posts={relatedPosts} />
            </div>

            {/* Table of contents sidebar */}
            {toc.length > 0 && (
              <aside className="hidden lg:block">
                <TableOfContents items={toc} />
              </aside>
            )}
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
