"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

// The root error boundary: a page, or the (app) or (demo) layout above it,
// that throws while rendering lands here instead of on a blank screen. It
// renders under the root layout alone, like the 404, so it needs no session
// or Convex connection to show, and trying again re-fetches what failed.

export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col bg-white dark:bg-black">
      <header className="px-6 pt-6 lg:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pt-[18vh] pb-24 text-center">
        <h1 className="text-4xl font-bold tracking-tighter text-gray-900 sm:text-5xl dark:text-white">
          Something went wrong.
        </h1>
        <p className="mt-3 max-w-md text-lg font-light text-balance text-gray-600 dark:text-gray-400">
          This page didn&apos;t load. It&apos;s usually brief, so try again in a moment.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Button size="lg" onClick={() => retry()}>
            Try again
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/" />} nativeButton={false}>
            Go to the homepage
          </Button>
        </div>
        {error.digest && (
          <p className="mt-10 font-mono text-xs text-gray-400 dark:text-gray-600">Reference {error.digest}</p>
        )}
      </main>
    </div>
  );
}
