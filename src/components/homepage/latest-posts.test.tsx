/**
 * The homepage's latest posts: a card per post, linking to it, with the date
 * the server wrote, the thumbnail for each theme, and a link to every post.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { LatestPosts, type LatestPost } from "./latest-posts";

afterEach(cleanup);

function post(slug: string, thumbnails: Pick<LatestPost, "thumbnail" | "thumbnailDark"> = {}): LatestPost {
  return {
    slug,
    title: `The ${slug} post`,
    spoiler: `What the ${slug} post says.`,
    date: "2026-10-11",
    displayDate: "October 11, 2026",
    readingTime: "5 min read",
    ...thumbnails,
  };
}

/** The images in a card: decorative, so they have no role to query by. */
const imagesIn = (card: HTMLElement) =>
  [...card.querySelectorAll("img")].map((img) => ({ src: img.getAttribute("src"), className: img.className }));

describe("LatestPosts", () => {
  it("links each card to its post, dated as the server wrote it", () => {
    render(<LatestPosts posts={[post("first"), post("second")]} />);

    const cards = screen.getAllByRole("article");
    expect(cards.map((card) => within(card).getByRole("link").getAttribute("href"))).toEqual([
      "/blog/first",
      "/blog/second",
    ]);
    expect(within(cards[0]).getByRole("heading", { name: "The first post" })).toBeTruthy();
    expect(within(cards[0]).getByText("October 11, 2026").getAttribute("datetime")).toBe("2026-10-11");
  });

  it("swaps in the dark thumbnail in the dark theme, and keeps a lone one in both", () => {
    render(
      <LatestPosts
        posts={[
          post("drawn", {
            thumbnail: "/images/blog/drawn/thumbnail.svg",
            thumbnailDark: "/images/blog/drawn/thumbnail-dark.svg",
          }),
          post("logo", { thumbnail: "/images/blog/logo/mark.svg" }),
        ]}
      />,
    );

    const [drawn, logo] = screen.getAllByRole("article");
    const [light, dark] = imagesIn(drawn);
    expect(light.src).toBe("/images/blog/drawn/thumbnail.svg");
    expect(light.className).toContain("dark:hidden");
    expect(dark.src).toBe("/images/blog/drawn/thumbnail-dark.svg");
    expect(dark.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(dark.className).toContain("dark:block");

    const [lone, ...rest] = imagesIn(logo);
    expect(rest).toEqual([]);
    expect(lone.className).not.toContain("hidden");
  });

  it("leads to every post", () => {
    render(<LatestPosts posts={[post("first")]} />);
    expect(screen.getByRole("link", { name: "All posts" }).getAttribute("href")).toBe("/blog");
  });

  it("draws nothing without a post", () => {
    const { container } = render(<LatestPosts posts={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
