import type { Metadata } from "next";

import { CommandPalette } from "@/components/command-menu/command-palette";
import { Logo } from "@/components/logo";
import { RequestedPath } from "./requested-path";

// The root 404: any URL no route matches, and any `notFound()` without a
// nearer boundary. It renders under the root layout alone, outside both route
// groups, so it reads no session and opens no Convex connection; its search
// is the command menu's, inline.

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-white selection:bg-primary/10 selection:text-primary dark:bg-black">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-10 -z-10 bg-linear-to-b from-gray-200/80 to-transparent to-70% bg-clip-text text-center text-[clamp(9rem,30vw,24rem)] leading-none font-bold tracking-tighter text-transparent select-none dark:from-zinc-800/80"
      >
        404
      </div>

      <header className="px-6 pt-6 lg:px-8">
        <Logo />
      </header>

      <main className="flex flex-1 flex-col items-center px-4 pt-[8vh] pb-24">
        <RequestedPath />
        <h1 className="mt-4 text-center text-4xl font-bold tracking-tighter text-gray-900 sm:text-5xl dark:text-white">
          This page doesn&apos;t exist.
        </h1>
        <p className="mt-3 text-center text-lg font-light text-gray-600 dark:text-gray-400">
          Search for where you meant to go.
        </p>

        <div className="mt-8 w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white/90 shadow-2xl shadow-black/5 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-black/40">
          <CommandPalette surface="page" />
        </div>
      </main>
    </div>
  );
}
