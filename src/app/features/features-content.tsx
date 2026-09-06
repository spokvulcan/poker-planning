"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Users,
  Zap,
  Timer,
  BarChart3,
  Layout,
  FileText,
  Moon,
  Smartphone,
  Link2,
  ArrowRight,
  Shield,
  Eye,
  EyeOff,
  Code2,
  Database,
  Palette,
  FileDown,
  TrendingUp,
  Target,
  Layers,
  LayoutTemplate,
  PenLine,
  CalendarClock,
  CircleDot,
  ListChecks,
  History,
  MessageSquare,
} from "lucide-react";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { GithubIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  RealtimeVotingAnimation,
  AnalyticsAnimation,
  JiraIntegrationAnimation,
  CanvasAnimation,
  ScalesAnimation,
  TimeToConsensusAnimation,
  IssuesAnimation,
  VoterAlignmentAnimation,
} from "./feature-animations";
import { HERO, QUICK_FEATURES, POKER, RETRO, TECH_STACK, WHY, ROADMAP, CTA } from "./copy";

type Icon = ComponentType<{ className?: string }>;
type Id =
  | (typeof QUICK_FEATURES)[number]["id"]
  | (typeof POKER.items)[number]["id"]
  | (typeof POKER.analytics.stats)[number]["id"]
  | (typeof RETRO.items)[number]["id"]
  | (typeof TECH_STACK.items)[number]["id"]
  | (typeof ROADMAP.shipped)[number]["id"]
  | (typeof ROADMAP.upNext)[number]["id"];

// Icons and visuals are keyed by the copy's ids; the words live in copy.ts.
const ICONS: Record<Id, Icon> = {
  // quick strip
  signup: Zap,
  theme: Moon,
  mobile: Smartphone,
  links: Link2,
  csv: FileDown,
  spectator: Eye,
  // planning poker
  voting: Users,
  scales: Layers,
  analytics: BarChart3,
  canvas: Layout,
  issues: FileText,
  jira: Link2,
  consensus: Timer,
  alignment: Target,
  average: TrendingUp,
  median: Target,
  strength: Users,
  outliers: Eye,
  // retro
  formats: LayoutTemplate,
  parallel: PenLine,
  async: CalendarClock,
  anonymous: EyeOff,
  dots: CircleDot,
  actions: ListChecks,
  history: History,
  link: Link2,
  // stack and roadmap
  next: Code2,
  convex: Database,
  flow: Layers,
  tailwind: Palette,
  retros: MessageSquare,
  predictability: TrendingUp,
  exports: FileDown,
  github: Code2,
  summaries: FileText,
};

const POKER_VISUALS: Record<(typeof POKER.items)[number]["id"], ComponentType> = {
  voting: RealtimeVotingAnimation,
  scales: ScalesAnimation,
  analytics: AnalyticsAnimation,
  canvas: CanvasAnimation,
  issues: IssuesAnimation,
  jira: JiraIntegrationAnimation,
  consensus: TimeToConsensusAnimation,
  alignment: VoterAlignmentAnimation,
};

const primaryCta =
  "inline-flex h-16 items-center justify-center gap-2 bg-black dark:bg-white px-12 text-lg font-bold tracking-tight text-white dark:text-black hover:scale-105 transition-transform duration-200 rounded-2xl w-full sm:w-auto";
const secondaryCta =
  "inline-flex h-16 items-center justify-center gap-2 bg-white dark:bg-zinc-950 border-2 border-gray-200 dark:border-zinc-800 px-12 text-lg font-bold tracking-tight text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors rounded-2xl w-full sm:w-auto";

export function FeaturesContent() {
  return (
    <div className="bg-white dark:bg-black min-h-screen selection:bg-primary/10 selection:text-primary">
      <Navbar />

      <main className="relative isolate overflow-hidden bg-white dark:bg-black">
        {/* Hero Section */}
        <section className="relative pt-32 pb-24 sm:pt-40 sm:pb-32 overflow-hidden bg-white dark:bg-black">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>

          <div className="mx-auto max-w-[90rem] px-6 lg:px-8 relative z-10">
            <div className="mx-auto max-w-4xl text-center">
              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[0.95]">
                {HERO.headline}<br />
                <span className="text-gray-300 dark:text-zinc-700">{HERO.headlineMuted}</span>
              </h1>

              <p className="mt-8 text-xl sm:text-2xl leading-relaxed text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                {HERO.description}
              </p>

              <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href={HERO.estimate.href} className={primaryCta}>
                  {HERO.estimate.label}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href={HERO.retro.href} className={secondaryCta}>
                  {HERO.retro.label}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>

              <nav aria-label={HERO.jumpTo} className="mt-10 flex items-center justify-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                <span>{HERO.jumpTo}:</span>
                <a href={`#${POKER.anchor}`} className="underline underline-offset-4 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {POKER.eyebrow}
                </a>
                <span aria-hidden="true">·</span>
                <a href={`#${RETRO.anchor}`} className="underline underline-offset-4 hover:text-gray-900 dark:hover:text-white transition-colors">
                  {RETRO.eyebrow}
                </a>
              </nav>
            </div>
          </div>
        </section>

        {/* Quick Features Strip */}
        <section className="border-y border-gray-200/50 dark:border-zinc-800/50 bg-gray-50/50 dark:bg-zinc-900/10">
          <div className="mx-auto max-w-[90rem] px-6 py-8 lg:px-8">
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
              {QUICK_FEATURES.map((feature) => {
                const Icon = ICONS[feature.id];
                return (
                  <div
                    key={feature.id}
                    className="flex items-center gap-3 text-base font-medium text-gray-600 dark:text-gray-400"
                  >
                    <Icon className="h-5 w-5 text-gray-900 dark:text-white" />
                    <span>{feature.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div id={POKER.anchor} className="scroll-mt-24">
          {/* Core Features Bento Grid */}
          <section className="py-24 sm:py-32 bg-white dark:bg-black">
            <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
              <div className="mb-16">
                <p className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
                  {POKER.eyebrow}
                </p>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1]">
                  {POKER.heading}<br />
                  <span className="text-gray-400 dark:text-zinc-600">{POKER.headingMuted}</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 grid-flow-dense">
                {POKER.items.map((feature, index) => {
                  const Icon = ICONS[feature.id];
                  const Visual = POKER_VISUALS[feature.id];
                  return (
                    <div
                      key={feature.id}
                      className={cn(
                        "group relative overflow-hidden rounded-3xl bg-gray-50/50 dark:bg-zinc-900/10 border border-gray-200/50 dark:border-zinc-800/50 flex flex-col",
                        index === 0 && "sm:col-span-2 sm:row-span-2",
                        index === 2 && "lg:col-span-2 min-h-[300px]",
                        index !== 0 && index !== 2 && "min-h-[320px]"
                      )}
                    >
                      {/* Content Top */}
                      <div className="relative z-10 p-6 sm:p-8 flex-shrink-0 pointer-events-none">
                        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 mb-6 pointer-events-auto shadow-sm">
                          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-gray-900 dark:text-white" />
                        </div>

                        <h3
                          className={cn(
                            "font-bold tracking-tight text-gray-900 dark:text-white mb-2 pointer-events-auto",
                            index === 0 ? "text-2xl sm:text-3xl" : "text-xl",
                          )}
                        >
                          {feature.name}
                        </h3>
                        <p
                          className={cn(
                            "text-gray-600 dark:text-gray-400 font-light leading-relaxed pointer-events-auto",
                            index === 0 ? "text-base sm:text-lg max-w-md" : "text-sm sm:text-base",
                          )}
                        >
                          {feature.description}
                        </p>

                        {index === 0 && (
                          <div className="mt-6 pt-6 border-t border-gray-200/50 dark:border-zinc-700/50 flex items-center gap-4 pointer-events-auto">
                            <div className="flex -space-x-3">
                              {[1, 2, 3, 4].map((i) => (
                                <div
                                  key={i}
                                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-xs sm:text-sm font-medium text-gray-900 dark:text-white"
                                >
                                  {i}
                                </div>
                              ))}
                            </div>
                            <span className="text-sm sm:text-base font-medium text-gray-500 dark:text-gray-400">
                              {POKER.unlimited}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Background animation Bottom */}
                      <div className="relative flex-1 w-full min-h-[140px] pointer-events-none">
                        <Visual />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Analytics Showcase */}
          <section className="py-24 sm:py-32 bg-gray-50/50 dark:bg-zinc-900/10 border-y border-gray-200/50 dark:border-zinc-800/50">
            <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
              <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
                <div>
                  <p className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
                    {POKER.analytics.eyebrow}
                  </p>
                  <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1]">
                    {POKER.analytics.heading}<br />
                    <span className="text-gray-400 dark:text-zinc-600">{POKER.analytics.headingMuted}</span>
                  </h2>
                  <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-400 font-light leading-relaxed">
                    {POKER.analytics.description}
                  </p>

                  <div className="mt-12 grid grid-cols-2 gap-6">
                    {POKER.analytics.stats.map((feature) => {
                      const Icon = ICONS[feature.id];
                      return (
                        <div
                          key={feature.id}
                          className="flex items-center gap-4 text-gray-900 dark:text-gray-300"
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-white dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 rounded-2xl">
                            <Icon className="h-5 w-5 text-gray-900 dark:text-white" />
                          </div>
                          <span className="text-base font-medium text-gray-900 dark:text-white">{feature.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Results Preview Card */}
                <div className="bg-white dark:bg-black rounded-[2rem] p-8 sm:p-12 border border-gray-200/50 dark:border-zinc-800/50">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                      {POKER.analytics.preview.title}
                    </h3>
                    <span className="px-4 py-2 rounded-full bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 text-sm font-bold tracking-wide">
                      {POKER.analytics.preview.badge}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-6 mb-10">
                    {[
                      { label: "Average", value: "5.2" },
                      { label: "Median", value: "5" },
                      { label: "Mode", value: "5" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="text-center p-6 rounded-2xl bg-gray-50 dark:bg-zinc-900/50 border border-gray-200/50 dark:border-zinc-800/50"
                      >
                        <div className="text-3xl font-bold tracking-tighter text-gray-900 dark:text-white">
                          {stat.value}
                        </div>
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2 uppercase tracking-widest">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {[
                      { value: "3", count: 2, width: "20%" },
                      { value: "5", count: 5, width: "50%" },
                      { value: "8", count: 3, width: "30%" },
                    ].map((bar) => (
                      <div key={bar.value} className="flex items-center gap-4">
                        <span className="w-8 text-base font-bold text-gray-900 dark:text-white">
                          {bar.value}
                        </span>
                        <div className="flex-1 h-4 bg-gray-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gray-900 dark:bg-white rounded-full"
                            style={{ width: bar.width }}
                          />
                        </div>
                        <span className="w-6 text-base font-medium text-gray-500 dark:text-gray-400 text-right">
                          {bar.count}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-10 pt-8 border-t border-gray-200/50 dark:border-zinc-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-base font-medium text-gray-600 dark:text-gray-400">
                      <Users className="h-5 w-5" />
                      <span>{POKER.analytics.preview.participants}</span>
                    </div>
                    <div className="text-base font-bold text-green-700 dark:text-green-400">
                      {POKER.analytics.preview.consensus}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Retro */}
        <section id={RETRO.anchor} className="scroll-mt-24 py-24 sm:py-32 bg-white dark:bg-black">
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
            <div className="mb-16 max-w-3xl">
              <p className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
                {RETRO.eyebrow}
              </p>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1]">
                {RETRO.heading}<br />
                <span className="text-gray-400 dark:text-zinc-600">{RETRO.headingMuted}</span>
              </h2>
              <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-400 font-light leading-relaxed">
                {RETRO.description}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {RETRO.items.map((item) => {
                const Icon = ICONS[item.id];
                return (
                  <div
                    key={item.id}
                    className="rounded-3xl bg-gray-50/50 dark:bg-zinc-900/10 p-8 border border-gray-200/50 dark:border-zinc-800/50"
                  >
                    <div className="flex h-12 w-12 items-center justify-center bg-white dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 rounded-2xl mb-6">
                      <Icon className="h-5 w-5 text-gray-900 dark:text-white" />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3">
                      {item.name}
                    </h3>
                    <p className="text-base font-light leading-relaxed text-gray-600 dark:text-gray-400">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-12">
              <Link
                href={HERO.retro.href}
                className="inline-flex h-14 items-center justify-center gap-2 bg-black dark:bg-white px-8 text-base font-bold tracking-tight text-white dark:text-black hover:scale-105 transition-transform duration-200 rounded-2xl"
              >
                {HERO.retro.label}
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="py-24 sm:py-32 bg-gray-50/50 dark:bg-zinc-900/10 border-y border-gray-200/50 dark:border-zinc-800/50">
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
            <div className="mb-16">
              <p className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
                {TECH_STACK.eyebrow}
              </p>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1]">
                {TECH_STACK.heading}<br />
                <span className="text-gray-400 dark:text-zinc-600">{TECH_STACK.headingMuted}</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {TECH_STACK.items.map((tech) => {
                const Icon = ICONS[tech.id];
                return (
                  <div
                    key={tech.id}
                    className="rounded-3xl bg-white dark:bg-black p-8 sm:p-10 border border-gray-200/50 dark:border-zinc-800/50"
                  >
                    <div className="flex h-14 w-14 items-center justify-center bg-gray-50 dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 rounded-2xl mb-8">
                      <Icon className="h-6 w-6 text-gray-900 dark:text-white" />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3">
                      {tech.name}
                    </h3>
                    <p className="text-base font-light leading-relaxed text-gray-600 dark:text-gray-400">
                      {tech.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Why AgileKit */}
        <section className="py-24 sm:py-32 bg-white dark:bg-black">
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
            <div className="mb-16">
              <p className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
                {WHY.eyebrow}
              </p>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1]">
                {WHY.heading}
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="rounded-3xl bg-black dark:bg-white p-10 sm:p-12">
                <div className="text-6xl sm:text-7xl font-bold tracking-tighter text-white dark:text-black mb-6">{WHY.free.price}</div>
                <h3 className="text-2xl font-bold tracking-tight text-white dark:text-black mb-4">{WHY.free.name}</h3>
                <p className="text-lg font-light leading-relaxed text-gray-400 dark:text-gray-600">
                  {WHY.free.description}
                </p>
              </div>

              <div className="rounded-3xl bg-gray-50/50 dark:bg-zinc-900/10 p-10 sm:p-12 border border-gray-200/50 dark:border-zinc-800/50">
                <div className="flex h-16 w-16 items-center justify-center bg-white dark:bg-zinc-900 rounded-2xl mb-8">
                  <Shield className="h-8 w-8 text-gray-900 dark:text-white" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
                  {WHY.privacy.name}
                </h3>
                <p className="text-lg font-light leading-relaxed text-gray-600 dark:text-gray-400">
                  {WHY.privacy.description}
                </p>
              </div>

              <div className="rounded-3xl bg-gray-50/50 dark:bg-zinc-900/10 p-10 sm:p-12 border border-gray-200/50 dark:border-zinc-800/50">
                <div className="flex h-16 w-16 items-center justify-center bg-white dark:bg-zinc-900 rounded-2xl mb-8">
                  <GithubIcon className="h-8 w-8 text-gray-900 dark:text-white" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
                  {WHY.openSource.name}
                </h3>
                <p className="text-lg font-light leading-relaxed text-gray-600 dark:text-gray-400">
                  {WHY.openSource.description}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Roadmap */}
        <section className="py-24 sm:py-32 bg-gray-50/50 dark:bg-zinc-900/10 border-y border-gray-200/50 dark:border-zinc-800/50">
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
            <div className="mb-16">
              <p className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
                {ROADMAP.eyebrow}
              </p>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1]">
                {ROADMAP.heading}<br />
                <span className="text-gray-400 dark:text-zinc-600">{ROADMAP.headingMuted}</span>
              </h2>
            </div>

            {/* Recently Shipped */}
            <h3 className="text-xs font-bold tracking-widest text-primary uppercase mb-6">
              {ROADMAP.shippedTitle}
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              {ROADMAP.shipped.map((feature) => {
                const Icon = ICONS[feature.id];
                return (
                  <div
                    key={feature.id}
                    className="rounded-3xl bg-white dark:bg-black p-8 border border-gray-200/50 dark:border-zinc-800/50"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex h-12 w-12 items-center justify-center bg-gray-50 dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 rounded-2xl">
                        <Icon className="h-5 w-5 text-gray-900 dark:text-white" />
                      </div>
                      <span className="px-4 py-2 rounded-full bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 text-sm font-bold tracking-wide">
                        {ROADMAP.shippedBadge}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3">
                      {feature.name}
                    </h3>
                    <p className="text-base font-light leading-relaxed text-gray-600 dark:text-gray-400">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Up Next */}
            <h3 className="text-xs font-bold tracking-widest text-primary uppercase mb-6">
              {ROADMAP.upNextTitle}
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {ROADMAP.upNext.map((feature) => {
                const Icon = ICONS[feature.id];
                return (
                  <div
                    key={feature.id}
                    className="rounded-3xl bg-white dark:bg-black p-8 border border-gray-200/50 dark:border-zinc-800/50"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex h-12 w-12 items-center justify-center bg-gray-50 dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 rounded-2xl">
                        <Icon className="h-5 w-5 text-gray-900 dark:text-white" />
                      </div>
                      <span className="px-4 py-2 rounded-full bg-gray-200/50 dark:bg-zinc-800/50 text-gray-900 dark:text-white text-sm font-bold tracking-wide">
                        {ROADMAP.upNextBadge}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3">
                      {feature.name}
                    </h3>
                    <p className="text-base font-light leading-relaxed text-gray-600 dark:text-gray-400">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative py-24 sm:py-32 bg-white dark:bg-black">
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[0.95]">
                {CTA.heading}<br />
                <span className="text-gray-400 dark:text-zinc-600">{CTA.headingMuted}</span>
              </h2>
              <p className="mt-8 text-xl sm:text-2xl text-gray-600 dark:text-gray-400 font-light leading-relaxed">
                {CTA.description}
              </p>
              <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href={CTA.estimate.href} className={primaryCta}>
                  {CTA.estimate.label}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href={CTA.retro.href} className={primaryCta}>
                  {CTA.retro.label}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <a
                  href={CTA.github.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={secondaryCta}
                >
                  <GithubIcon className="h-5 w-5" />
                  {CTA.github.label}
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
