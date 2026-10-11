import { BLOG_DESCRIPTION, SITE_SHORT_DESCRIPTION } from "./site-copy";

/**
 * The production origin. Canonical and Open Graph URLs, the sitemap, robots,
 * feeds and structured data name it on every deployment: a canonical that
 * follows the deployment URL sent search engines to a preview build. Auth
 * callbacks and emails need the deployment's own URL, from `getSiteUrl()`.
 */
export const SITE_ORIGIN = "https://agilekit.app";

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

/**
 * The origins auth takes requests from: the deployment's own, production's
 * and Vercel's previews. A development deployment (its site on localhost)
 * takes every local port too, so each worktree's dev server can sign in:
 * BetterAuth checks the origin of every request that carries cookies, and a
 * browser sends its localhost cookies to every port.
 */
export function authTrustedOrigins(siteUrl: string): string[] {
  const development = new URL(siteUrl).hostname === "localhost";
  return [
    siteUrl,
    ...(development ? ["http://localhost:*"] : []),
    SITE_ORIGIN,
    "https://*.agilekit.app",
    "https://*.vercel.app", // Vercel preview deployments
  ];
}

export const siteConfig = {
  name: "AgileKit",
  url: SITE_ORIGIN,
  description: SITE_SHORT_DESCRIPTION,
  author: {
    name: "AgileKit Team",
  },
  // A raster logo: Google reads Organization logos of at least 112x112px.
  logo: `${SITE_ORIGIN}/logo-512.png`,
  blog: {
    title: "AgileKit Blog",
    description: BLOG_DESCRIPTION,
  },
} as const;

export type SiteConfig = typeof siteConfig;
