"use client";

import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import {
  HowItWorks,
  FAQ,
  UseCases,
  CallToAction,
  AppPreview,
  FeaturesSection,
  PricingSection,
} from "@/components/homepage";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

interface VersionInfo {
  version: string;
  relativeTime: string;
}

interface HomeContentProps {
  versionInfo: VersionInfo | null;
}

export function HomeContent({ versionInfo }: HomeContentProps) {
  return (
    <div className="bg-white dark:bg-black selection:bg-primary/10 selection:text-primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-sm font-medium"
      >
        Skip to main content
      </a>

      <Navbar />

      <main
        id="main-content"
        className="relative bg-white dark:bg-black"
      >
        {/* Hero Section */}
        <section className="relative pt-32 pb-24 sm:pt-40 sm:pb-32 overflow-hidden bg-white dark:bg-black">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>
          
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
              {/* Left Column */}
              <div className="flex flex-col items-start lg:py-20">
                <Link
                  href="/blog/jira-integration"
                  className="inline-flex items-center gap-2 mb-8 rounded-full bg-white/60 dark:bg-zinc-800/60 backdrop-blur-md px-4 py-1.5 text-sm font-medium text-primary hover:bg-white/80 dark:hover:bg-zinc-800/80 transition-colors shadow-sm"
                >
                  <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground leading-none">
                    {versionInfo ? `v${versionInfo.version}` : "New"}
                  </span>
                  <span>Jira Cloud integration is here</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                
                <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[0.95]">
                  Planning poker,<br />
                  <span className="text-gray-300 dark:text-zinc-700">without the noise.</span>
                </h1>
                
                <p className="mt-8 text-xl sm:text-2xl leading-relaxed text-gray-600 dark:text-gray-400 max-w-xl font-light">
                  A radically simple estimation tool for agile teams. 
                  No accounts required. Free forever. Start a session instantly.
                </p>
                
                <div className="mt-12 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                  <Link
                    href="/room/new"
                    data-testid="hero-start-button"
                    className="inline-flex h-16 items-center justify-center gap-2 bg-black dark:bg-white px-12 text-lg font-bold tracking-tight text-white dark:text-black hover:scale-105 transition-transform duration-200 rounded-2xl w-full sm:w-auto"
                  >
                    Start Session
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                  <Link
                    href="/demo"
                    className="inline-flex h-16 items-center justify-center gap-2 bg-white dark:bg-zinc-950 border-2 border-gray-200 dark:border-zinc-800 px-12 text-lg font-bold tracking-tight text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors rounded-2xl w-full sm:w-auto"
                  >
                    <Play className="h-5 w-5" fill="currentColor" />
                    Interactive Demo
                  </Link>
                </div>
              </div>

              {/* Right Column (Visual) - Edge-to-edge on right */}
              <div className="relative w-full lg:w-[135%] aspect-square sm:aspect-video lg:aspect-[4/3] rounded-[2rem] overflow-hidden border border-gray-200/80 dark:border-zinc-800/80 shadow-2xl bg-white dark:bg-black flex flex-col ring-1 ring-inset ring-black/5 dark:ring-white/5">
                {/* macOS style browser header */}
                <div className="flex items-center gap-2 px-4 h-6 sm:h-8 bg-gray-50/80 dark:bg-zinc-900/80 border-b border-gray-200/50 dark:border-zinc-800/50 backdrop-blur-md shrink-0">
                  <div className="flex gap-1.5 sm:gap-2">
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-400 dark:bg-red-500"></div>
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-amber-400 dark:bg-amber-500"></div>
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-400 dark:bg-green-500"></div>
                  </div>
                </div>
                {/* Simulated Glass overlay on top of iframe container */}
                <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-black/5 dark:ring-white/5 rounded-[2rem] z-10"></div>
                <div className="relative flex-1 w-full bg-white dark:bg-black">
                  <iframe
                    src="/demo?embed=true"
                    className="absolute inset-0 w-[calc(100%+2px)] h-[calc(100%+2px)] -left-[1px] -top-[1px] border-none outline-none ring-0"
                    title="Live Planning Poker Demo"
                    sandbox="allow-scripts allow-same-origin"
                    style={{ border: 'none', outline: 'none' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <HowItWorks />
        <AppPreview />
        <FeaturesSection />
        <PricingSection />
        <UseCases />
        <FAQ />
        <CallToAction />
      </main>

      <Footer />
    </div>
  );
}
