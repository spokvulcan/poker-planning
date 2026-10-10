import Link from "next/link";
import type { PostMeta } from "../posts";
import { formatDate } from "../posts";
import { Clock, Calendar } from "lucide-react";

interface PostCardProps {
  post: PostMeta;
}

export function PostCard({ post }: PostCardProps) {
  return (
    <article className="group">
      <Link
        href={`/blog/${post.slug}`}
        className="block p-6 -mx-6 rounded-xl transition-all duration-200 hover:bg-gray-50 dark:hover:bg-surface-2"
      >
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white group-hover:text-primary transition-colors">
          {post.title}
        </h2>

        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {formatDate(post.date)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            {post.readingTime}
          </span>
        </div>

        <p className="mt-3 text-gray-600 dark:text-gray-400 leading-relaxed">
          {post.spoiler}
        </p>

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
      </Link>
    </article>
  );
}
