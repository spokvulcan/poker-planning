import { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site-config";
import { INDEXED_PATHS, PUBLIC_PATHS } from "@/lib/page-metadata";

/** A path's rule: up to its first dynamic segment, so "/room/[roomId]" is every room. */
const ruleOf = (path: string) => path.replace(/\[.*$/, "");

export default function robots(): MetadataRoute.Robots {
  const disallow = Object.entries(PUBLIC_PATHS)
    .filter(([, indexing]) => indexing === "disallow")
    .map(([path]) => ruleOf(path));
  // Rooms stay out of crawlers' reach, but /room/new is the Start
  // estimating page: the longer, more specific Allow wins over
  // Disallow: /room/, so crawlers read its title instead of indexing a bare
  // URL they were told not to fetch. Every indexable page under a
  // disallowed path is allowed that way.
  const allow = INDEXED_PATHS.map(ruleOf).filter((rule) =>
    disallow.some((disallowed) => rule.startsWith(disallowed)),
  );

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", ...allow],
        // Route handlers, which are not pages.
        disallow: [...disallow, "/api/"],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
