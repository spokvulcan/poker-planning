/**
 * The homepage shows the newest posts with their thumbnails, so every post
 * names one: an image of its own under `/images/blog/<slug>/`, in public/,
 * and the same for the dark one when it has one.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPosts } from "./posts";

describe("blog thumbnails", () => {
  it("gives every post a thumbnail among its own images", async () => {
    const posts = await getPosts();
    expect(posts.length).toBeGreaterThan(0);

    const problems = posts.flatMap((post) => {
      if (!post.thumbnail) return [`${post.slug}: no thumbnail`];
      return [post.thumbnail, post.thumbnailDark]
        .filter((src): src is string => src !== undefined)
        .filter(
          (src) =>
            !src.startsWith(`/images/blog/${post.slug}/`) ||
            !fs.existsSync(path.join(process.cwd(), "public", src)),
        )
        .map((src) => `${post.slug}: ${src} is not one of its images`);
    });
    expect(problems).toEqual([]);
  });
});
