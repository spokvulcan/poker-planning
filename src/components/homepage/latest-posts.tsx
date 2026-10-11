import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PostMeta } from "@/app/(app)/blog/posts";
import { cn } from "@/lib/utils";
import { LATEST_POSTS } from "./copy";

/** A post as the homepage lists it. The page reads it from the blog's files. */
export type LatestPost = Pick<
  PostMeta,
  "slug" | "title" | "spoiler" | "date" | "readingTime" | "thumbnail" | "thumbnailDark"
> & {
  /**
   * `date` as a reader sees it, written on the server: a browser in another
   * time zone would print a different day and fail hydration.
   */
  displayDate: string;
};

/** A card's image width at each breakpoint: one, two or three cards across. */
const SIZES = "(min-width: 1440px) 450px, (min-width: 1024px) 31vw, (min-width: 640px) 46vw, 100vw";

/**
 * The newest posts, one card each. Two cards across fit the tablet widths,
 * so a third waits there for the three-across desktop row.
 */
export function LatestPosts({ posts }: { posts: LatestPost[] }) {
  if (posts.length === 0) return null;

  return (
    <section id="blog" data-testid="latest-posts" className="bg-white dark:bg-black py-24 sm:py-32">
      <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between mb-16">
          <div className="max-w-2xl">
            <h2 className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
              {LATEST_POSTS.eyebrow}
            </h2>
            <h3 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1] mb-6">
              {LATEST_POSTS.heading}<br />
              <span className="text-gray-400 dark:text-zinc-600">{LATEST_POSTS.headingMuted}</span>
            </h3>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 font-light">
              {LATEST_POSTS.description}
            </p>
          </div>
          <Link
            href={LATEST_POSTS.all.href}
            className="inline-flex h-14 w-full sm:w-auto sm:self-start lg:self-auto shrink-0 items-center justify-center gap-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 px-8 text-base font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-2xl"
          >
            {LATEST_POSTS.all.label}
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post, i) => (
            <PostCard key={post.slug} post={post} className={i === 2 ? "sm:max-lg:hidden" : undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PostCard({ post, className }: { post: LatestPost; className?: string }) {
  return (
    <article className={cn("group", className)}>
      <Link
        href={`/blog/${post.slug}`}
        className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-gray-50/50 dark:bg-surface-1 border border-gray-200/50 dark:border-zinc-800/50 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {post.thumbnail && (
          <div className="relative aspect-video overflow-hidden border-b border-gray-200/50 dark:border-zinc-800/50">
            {/* The title names the post, so the picture is decoration. */}
            <Thumbnail src={post.thumbnail} className={post.thumbnailDark ? "dark:hidden" : undefined} />
            {post.thumbnailDark && <Thumbnail src={post.thumbnailDark} className="hidden dark:block" />}
          </div>
        )}
        <div className="flex flex-1 flex-col p-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <time dateTime={post.date}>{post.displayDate}</time>
            <span aria-hidden="true"> · </span>
            {post.readingTime}
          </p>
          <h4 className="mt-3 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            {post.title}
          </h4>
          <p className="mt-3 text-base text-gray-600 dark:text-gray-400 font-light leading-relaxed line-clamp-3">
            {post.spoiler}
          </p>
        </div>
      </Link>
    </article>
  );
}

function Thumbnail({ src, className }: { src: string; className?: string }) {
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={SIZES}
      className={cn(
        "object-cover transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.02]",
        className,
      )}
    />
  );
}
