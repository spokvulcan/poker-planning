import { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Rooms stay out of crawlers' reach, but /room/new is the Start
        // estimating page: the longer, more specific Allow wins over
        // Disallow: /room/, so crawlers read its title instead of indexing
        // a bare URL they were told not to fetch.
        allow: ["/", "/room/new"],
        disallow: ["/room/", "/demo", "/api/"],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
