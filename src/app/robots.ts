import { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site-config";
import { DISALLOWED_PATHS, INDEXED_PATHS, robotsRuleOf } from "@/lib/page-metadata";

export default function robots(): MetadataRoute.Robots {
  const disallow = DISALLOWED_PATHS.map(robotsRuleOf);
  // Rooms stay out of crawlers' reach, but /room/new is the Start
  // estimating page: the longer, more specific Allow wins over
  // Disallow: /room/, so crawlers read its title instead of indexing a bare
  // URL they were told not to fetch. Every indexable page under a
  // disallowed path is allowed that way.
  const allow = INDEXED_PATHS.map(robotsRuleOf).filter((rule) =>
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
