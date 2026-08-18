import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Starfield } from "@/components/starfield";
import {
  parseChangelog,
  formatRelativeTime,
  type ChangelogRelease,
} from "@/lib/changelog";

export const metadata: Metadata = {
  title: "Changelog - AgileKit",
  description:
    "Track the latest updates, features, and improvements to AgileKit. See what's new in our open-source planning poker tool.",
  openGraph: {
    title: "Changelog - AgileKit",
    description:
      "Track the latest updates, features, and improvements to AgileKit.",
    type: "website",
    url: "https://agilekit.dev/changelog",
  },
  alternates: {
    canonical: "https://agilekit.dev/changelog",
  },
};

/**
 * How many releases stay expanded. The rest sit behind a disclosure: the very
 * first release carries every pre-1.0 commit, so rendering the full history
 * eagerly makes the page tens of thousands of pixels tall.
 */
const EXPANDED_RELEASE_COUNT = 10;

function ReleaseSection({ release }: { release: ChangelogRelease }) {
  const relativeTime = formatRelativeTime(release.date);

  return (
    <article className="relative pl-8 pb-12 last:pb-0">
      <div className="absolute left-0 top-4 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-white dark:ring-black" />

      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">
          v{release.version}
        </h2>
        <time
          dateTime={release.date}
          className="mt-1 block text-sm text-gray-500 dark:text-gray-400"
        >
          {relativeTime}
        </time>
      </header>

      <div className="space-y-6">
        {release.categories.map((category) => (
          <section key={category.name}>
            <h3 className="text-sm font-medium uppercase tracking-wider text-primary mb-3">
              {category.name}
            </h3>
            <ul className="space-y-2">
              {category.entries.map((entry, index) => (
                <li
                  key={index}
                  className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed"
                >
                  {entry.text}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}

/**
 * The older half of the timeline. A native `<details>` keeps this a server
 * component and keeps the entries in the markup for crawlers, while costing
 * the reader nothing until they open it.
 */
function EarlierReleases({ releases }: { releases: ChangelogRelease[] }) {
  return (
    <details className="group">
      <summary className="relative flex cursor-pointer list-none items-center gap-2 pl-8 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gray-300 bg-white ring-4 ring-white dark:border-zinc-700 dark:bg-black dark:ring-black"
        />
        <span className="group-open:hidden">
          Show {releases.length} earlier releases
        </span>
        <span className="hidden group-open:inline">Hide earlier releases</span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="mt-12">
        {releases.map((release) => (
          <ReleaseSection key={release.version} release={release} />
        ))}
      </div>
    </details>
  );
}

export default async function ChangelogPage() {
  const releases = parseChangelog();
  const expandedReleases = releases.slice(0, EXPANDED_RELEASE_COUNT);
  const earlierReleases = releases.slice(EXPANDED_RELEASE_COUNT);

  return (
    <div className="relative min-h-screen bg-white dark:bg-black overflow-hidden">
      <div className="fixed inset-0 z-0">
        <Starfield
          starColorLight="rgba(0, 0, 0, 0.6)"
          starColorDark="rgba(255, 255, 255, 0.8)"
          bgColorLight="rgba(255, 255, 255, 1)"
          bgColorDark="rgba(0, 0, 0, 1)"
          speed={0.5}
          quantity={256}
          mouseAdjust
        />
      </div>
      <div className="relative z-10">
        <Navbar />

        <main className="pt-32 pb-16 sm:pt-40 sm:pb-20">
          <div className="mx-auto max-w-3xl px-6 lg:px-8">
            <header className="mb-16">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
                Changelog
              </h1>
              <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
                New updates and improvements to AgileKit.
              </p>
            </header>

            <div className="relative">
              <div
                aria-hidden
                className="absolute left-0 top-4 bottom-0 w-0.5 -translate-x-1/2 rounded-full bg-gray-100 dark:bg-zinc-800"
              />
              {expandedReleases.map((release) => (
                <ReleaseSection key={release.version} release={release} />
              ))}
              {earlierReleases.length > 0 && (
                <EarlierReleases releases={earlierReleases} />
              )}
            </div>

            {releases.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400">
                No releases found.
              </p>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
