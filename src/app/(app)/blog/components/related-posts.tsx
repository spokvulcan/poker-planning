import Link from "next/link";
import type { PostMeta } from "../posts";
import { formatDate } from "../posts";

interface RelatedPostsProps {
  posts: PostMeta[];
}

export function RelatedPosts({ posts }: RelatedPostsProps) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="mt-16 pt-8 border-t border-gray-200 dark:border-zinc-800">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
        Related Articles
      </h3>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group block p-4 rounded-lg border border-gray-200 dark:border-zinc-800 hover:border-primary/50 dark:hover:border-primary/50 transition-colors"
          >
            <h4 className="font-medium text-gray-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2">
              {post.title}
            </h4>
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
              {post.spoiler}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatDate(post.date)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
