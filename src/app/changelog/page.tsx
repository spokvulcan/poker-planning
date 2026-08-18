import type { Metadata } from "next";
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

export default async function ChangelogPage() {
  const releases = parseChangelog();

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
              {releases.map((release) => (
                <ReleaseSection key={release.version} release={release} />
              ))}
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
