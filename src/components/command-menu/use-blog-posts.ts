"use client";

import { useEffect, useState } from "react";

export interface BlogPostLink {
  slug: string;
  title: string;
  tags: string[];
}

// One request per page load, shared by every palette that mounts. A failed
// one is forgotten, so the next open asks again.
let request: Promise<BlogPostLink[]> | undefined;

function fetchPosts(): Promise<BlogPostLink[]> {
  request ??= fetch("/blog/posts.json")
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .catch(() => {
      request = undefined;
      return [];
    });
  return request;
}

/** The blog's posts, empty until they arrive (or if they never do). */
export function useBlogPosts(): BlogPostLink[] {
  const [posts, setPosts] = useState<BlogPostLink[]>([]);

  useEffect(() => {
    let live = true;
    void fetchPosts().then((loaded) => {
      if (live) setPosts(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  return posts;
}

/** Test seam: forget the shared request. */
export function resetBlogPostsForTest() {
  request = undefined;
}
