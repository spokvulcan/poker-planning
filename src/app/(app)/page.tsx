import { Metadata } from "next";
import { HomeContent } from "./home-content";
import {
  WebSiteSchema,
  WebApplicationSchema,
  OrganizationSchema,
  FAQSchema,
} from "@/components/seo/structured-data";
import { getLatestRelease, formatRelativeTime } from "@/lib/changelog";
import { SITE_ORIGIN } from "@/lib/site-config";

export const metadata: Metadata = {
  alternates: {
    canonical: SITE_ORIGIN,
  },
};

export default function HomePage() {
  const latestRelease = getLatestRelease();
  const versionInfo = latestRelease
    ? {
        version: latestRelease.version,
        relativeTime: formatRelativeTime(latestRelease.date),
      }
    : null;

  return (
    <>
      <WebSiteSchema />
      <WebApplicationSchema />
      <OrganizationSchema />
      <FAQSchema />
      <HomeContent versionInfo={versionInfo} />
    </>
  );
}
