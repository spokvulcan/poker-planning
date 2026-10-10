/**
 * The structured data says what the page heads say about the site: its
 * name, its author and its logo, all from `siteConfig`.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { BlogPostingSchema, OrganizationSchema, WebSiteSchema } from "./structured-data";
import { pageMetadata } from "@/lib/page-metadata";
import { siteConfig } from "@/lib/site-config";

/** The JSON-LD a schema component renders. */
function jsonLd(element: ReactElement) {
  const html = renderToStaticMarkup(element);
  return JSON.parse(html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
}

const POST = {
  title: "Story Points vs Hours",
  description: "Which to use.",
  datePublished: "2025-01-08",
  slug: "story-points-vs-hours",
};

describe("structured data", () => {
  it("credits a post to the author its card names", () => {
    const card = pageMetadata({
      title: POST.title,
      description: POST.description,
      path: `/blog/${POST.slug}`,
      article: { publishedTime: POST.datePublished, modifiedTime: POST.datePublished },
    });
    const post = jsonLd(createElement(BlogPostingSchema, POST));
    expect(post.author.name).toBe("AgileKit Team");
    expect(card.openGraph).toMatchObject({ authors: ["AgileKit Team"] });
  });

  it("shows the site's logo for the organization and as a post's publisher", () => {
    const organization = jsonLd(createElement(OrganizationSchema));
    const post = jsonLd(createElement(BlogPostingSchema, POST));
    expect(siteConfig.logo).toBe("https://agilekit.app/logo-512.png");
    expect(organization.logo).toBe(siteConfig.logo);
    expect(post.publisher.logo.url).toBe(siteConfig.logo);
  });

  it("names the site the way the cards' site name does", () => {
    const { siteName } = pageMetadata({ title: "Pricing", description: "x", path: "/pricing" })
      .openGraph as { siteName: string };
    expect(siteName).toBe(siteConfig.name);
    expect(jsonLd(createElement(WebSiteSchema)).name).toBe(siteConfig.name);
    expect(jsonLd(createElement(OrganizationSchema)).name).toBe(siteConfig.name);
    expect(jsonLd(createElement(BlogPostingSchema, POST)).publisher.name).toBe(siteConfig.name);
  });
});
