import { BLOG_DESCRIPTION, SITE_SHORT_DESCRIPTION } from "./site-copy";

export function getSiteUrl(): string {
  // Convex backend uses SITE_URL (set via `npx convex env set`)
  if (process.env.SITE_URL) {
    return process.env.SITE_URL;
  }
  // Next.js custom URL (for production)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  // Vercel preview/production deployments
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }
  // Local development
  return "http://localhost:3000";
}

export const siteConfig = {
  name: "AgileKit",
  url: getSiteUrl(),
  description: SITE_SHORT_DESCRIPTION,
  author: {
    name: "AgileKit Team",
  },
  blog: {
    title: "AgileKit Blog",
    description: BLOG_DESCRIPTION,
  },
} as const;

export type SiteConfig = typeof siteConfig;
