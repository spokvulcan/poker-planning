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
import { getPosts, formatDate } from "./blog/posts";

/** The posts the homepage lists: one row of three on a desktop. */
const LATEST_POST_COUNT = 3;

export const metadata: Metadata = {
  alternates: {
    canonical: SITE_ORIGIN,
  },
};

export default async function HomePage() {
  const latestRelease = getLatestRelease();
  const versionInfo = latestRelease
    ? {
        version: latestRelease.version,
        relativeTime: formatRelativeTime(latestRelease.date),
      }
    : null;
  const latestPosts = (await getPosts())
    .slice(0, LATEST_POST_COUNT)
    .map(({ slug, title, spoiler, date, readingTime, thumbnail, thumbnailDark }) => ({
      slug,
      title,
      spoiler,
      date,
      displayDate: formatDate(date),
      readingTime,
      thumbnail,
      thumbnailDark,
    }));

  return (
    <>
      <WebSiteSchema />
      <WebApplicationSchema />
      <OrganizationSchema />
      <FAQSchema />
      <HomeContent versionInfo={versionInfo} latestPosts={latestPosts} />
    </>
  );
}
