"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Heart,
  Shield,
  Zap,
  ArrowRight,
  Star,
  Code2,
  Database,
  Layers,
  Palette,
  GitMerge
} from "lucide-react";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { useGitHubStats } from "@/hooks/use-github-stats";
import { GithubIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { HERO, PRINCIPLES, STACK, CTA } from "./copy";

type Icon = ComponentType<{ className?: string }>;
type ValueId = (typeof PRINCIPLES.values)[number]["id"];
type StackId = (typeof STACK.items)[number]["id"];

// Icons and gradients are keyed by the copy's ids; the words live in copy.ts.
const VALUE_ICONS: Record<ValueId, { icon: Icon; gradient: string }> = {
  open: { icon: Heart, gradient: "from-rose-500 to-pink-600" },
  privacy: { icon: Shield, gradient: "from-emerald-500 to-teal-600" },
  realtime: { icon: Zap, gradient: "from-amber-500 to-orange-600" },
};

const STACK_ICONS: Record<StackId, Icon> = {
  next: Code2,
  react: Layers,
  convex: Database,
  flow: GitMerge,
  tailwind: Palette,
  typescript: Code2,
};

export function AboutContent() {
  const { stars, isLoading } = useGitHubStats();

  return (
    <div className="bg-white dark:bg-black min-h-screen selection:bg-primary/10 selection:text-primary">
      <Navbar />

      <main className="relative isolate overflow-hidden bg-white dark:bg-black">
        {/* Hero Section */}
        <section className="relative pt-32 pb-24 sm:pt-40 sm:pb-32 overflow-hidden bg-white dark:bg-black">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] bg-size-[4rem_4rem]"></div>

          <div className="mx-auto max-w-360 px-6 lg:px-8 relative z-10">
            <div className="mx-auto max-w-4xl text-center">
              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[0.95]">
                {HERO.headline}<br />
                <span className="text-gray-300 dark:text-zinc-700">
                  {HERO.headlineMuted}
                </span>
              </h1>

              <p className="mt-8 text-xl sm:text-2xl leading-relaxed text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                {HERO.position}
              </p>

              <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href={STACK.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-16 items-center justify-center gap-3 bg-black dark:bg-white px-12 text-lg font-bold tracking-tight text-white dark:text-black hover:scale-105 transition-transform duration-200 rounded-2xl w-full sm:w-auto"
                >
                  <GithubIcon className="h-6 w-6" />
                  {HERO.star}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 dark:bg-black/10 px-3 py-1 text-sm font-bold text-white dark:text-black ml-2">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {isLoading ? "..." : stars.toLocaleString()}
                  </span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-24 sm:py-32 bg-gray-50/50 dark:bg-zinc-900/10 border-y border-gray-200/50 dark:border-zinc-800/50">
          <div className="mx-auto max-w-360 px-6 lg:px-8">
            <div className="mb-16">
              <p className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
                {PRINCIPLES.eyebrow}
              </p>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1]">
                {PRINCIPLES.heading}<br />
                <span className="text-gray-400 dark:text-zinc-600">{PRINCIPLES.headingMuted}</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {PRINCIPLES.values.map((value) => {
                const { icon: Icon, gradient } = VALUE_ICONS[value.id];
                return (
                  <div
                    key={value.id}
                    className="group relative overflow-hidden rounded-[2rem] bg-white dark:bg-black p-8 sm:p-10 border border-gray-200/50 dark:border-zinc-800/50 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div className="relative z-10">
                      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 mb-8 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                        <Icon className="h-6 w-6 text-gray-900 dark:text-white" />
                      </div>
                      <h3 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
                        {value.title}
                      </h3>
                      <p className="text-lg font-light leading-relaxed text-gray-600 dark:text-gray-400">
                        {value.description}
                      </p>
                    </div>

                    {/* Subtle gradient background on hover */}
                    <div className={cn(
                      "absolute -bottom-24 -right-24 w-48 h-48 rounded-full blur-[3xl] opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-linear-to-br pointer-events-none",
                      gradient
                    )} />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Tech Stack Section */}
        <section className="py-24 sm:py-32 bg-white dark:bg-black">
          <div className="mx-auto max-w-360 px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              <div>
                <p className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
                  {STACK.eyebrow}
                </p>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1]">
                  {STACK.heading}<br />
                  <span className="text-gray-400 dark:text-zinc-600">{STACK.headingMuted}</span>
                </h2>
                <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-400 font-light leading-relaxed">
                  {STACK.description}
                </p>

                <div className="mt-10">
                  <a
                    href={STACK.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-lg font-medium text-gray-900 dark:text-white hover:text-primary transition-colors"
                  >
                    {STACK.link.label}
                    <ArrowRight className="h-5 w-5" />
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:gap-6">
                {STACK.items.map((tech) => {
                  const Icon = STACK_ICONS[tech.id];
                  return (
                    <div
                      key={tech.id}
                      className="flex flex-col gap-4 rounded-3xl bg-gray-50/50 dark:bg-zinc-900/10 p-6 sm:p-8 border border-gray-200/50 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <Icon className="h-6 w-6 text-gray-900 dark:text-white" />
                      <div>
                        <h3 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
                          {tech.name}
                        </h3>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
                          {tech.category}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative py-24 sm:py-32 bg-gray-50/50 dark:bg-zinc-900/10 border-t border-gray-200/50 dark:border-zinc-800/50">
          <div className="mx-auto max-w-360 px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[0.95]">
                {CTA.heading}<br />
                <span className="text-gray-400 dark:text-zinc-600">{CTA.headingMuted}</span>
              </h2>
              <p className="mt-8 text-xl sm:text-2xl text-gray-600 dark:text-gray-400 font-light leading-relaxed">
                {CTA.description}
              </p>
              <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href={CTA.estimate.href}
                  className="inline-flex h-16 items-center justify-center gap-2 bg-black dark:bg-white px-12 text-lg font-bold tracking-tight text-white dark:text-black hover:scale-105 transition-transform duration-200 rounded-2xl w-full sm:w-auto"
                >
                  {CTA.estimate.label}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href={CTA.retro.href}
                  className="inline-flex h-16 items-center justify-center gap-2 bg-black dark:bg-white px-12 text-lg font-bold tracking-tight text-white dark:text-black hover:scale-105 transition-transform duration-200 rounded-2xl w-full sm:w-auto"
                >
                  {CTA.retro.label}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <a
                  href={CTA.source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-16 items-center justify-center gap-2 bg-white dark:bg-zinc-950 border-2 border-gray-200 dark:border-zinc-800 px-12 text-lg font-bold tracking-tight text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors rounded-2xl w-full sm:w-auto"
                >
                  <GithubIcon className="h-5 w-5" />
                  {CTA.source.label}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
