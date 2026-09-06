"use client";

import Link from "next/link";
import { Check, ArrowRight, Play } from "lucide-react";
import { PricingSection } from "@/components/homepage";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HERO, STATUS, COMPARISON, FAQ, CTA } from "./copy";

export function PricingContent() {
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

              <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-base font-medium text-gray-500 dark:text-gray-400">
                {HERO.points.map((point) => (
                  <div key={point} className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-gray-900 dark:text-white" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Status Banner */}
        <section className="border-y border-gray-200/50 dark:border-zinc-800/50 bg-gray-50/50 dark:bg-zinc-900/10">
          <div className="mx-auto max-w-[90rem] px-6 py-12 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
              <div className="max-w-2xl">
                <p className="text-sm font-bold tracking-widest text-primary uppercase mb-2">
                  {STATUS.eyebrow}
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
                  {STATUS.heading}
                </h2>
                <p className="text-lg font-light leading-relaxed text-gray-600 dark:text-gray-400">
                  {STATUS.description}
                </p>
              </div>
              <div className="shrink-0 flex flex-col gap-4 w-full lg:w-auto">
                <div className="rounded-2xl border border-gray-200/50 bg-white p-6 text-center text-base font-medium text-gray-600 dark:border-zinc-800/50 dark:bg-zinc-900/50 dark:text-gray-400">
                  {STATUS.enterprise}
                </div>
                <div className="flex flex-wrap justify-center gap-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  <Link href={STATUS.links.refund.href} className="hover:text-gray-900 dark:hover:text-white transition-colors underline underline-offset-4">{STATUS.links.refund.label}</Link>
                  <Link href={STATUS.links.terms.href} className="hover:text-gray-900 dark:hover:text-white transition-colors underline underline-offset-4">{STATUS.links.terms.label}</Link>
                  <a href={STATUS.links.billing.href} className="hover:text-gray-900 dark:hover:text-white transition-colors underline underline-offset-4">{STATUS.links.billing.label}</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Cards */}
        <PricingSection />

        {/* Comparison Table */}
        <section className="py-24 sm:py-32 bg-gray-50/50 dark:bg-zinc-900/10 border-y border-gray-200/50 dark:border-zinc-800/50">
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
            <div className="mb-16 max-w-2xl">
              <p className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
                {COMPARISON.eyebrow}
              </p>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1]">
                {COMPARISON.heading}<br />
                <span className="text-gray-400 dark:text-zinc-600">{COMPARISON.headingMuted}</span>
              </h2>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-gray-200/50 dark:border-zinc-800/50 bg-white dark:bg-black shadow-sm">
              {/* Header */}
              <div className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-3 bg-gray-50/80 dark:bg-zinc-900/80 border-b border-gray-200/50 dark:border-zinc-800/50">
                <div className="px-6 sm:px-8 py-6 text-sm font-bold tracking-widest text-gray-500 dark:text-gray-400 uppercase">
                  {COMPARISON.columns.feature}
                </div>
                <div className="px-4 sm:px-8 py-6 text-center text-base sm:text-lg font-bold tracking-tight text-gray-900 dark:text-white border-l border-gray-200/50 dark:border-zinc-800/50">
                  {COMPARISON.columns.free}
                </div>
                <div className="px-4 sm:px-8 py-6 text-center text-base sm:text-lg font-bold tracking-tight text-white bg-gray-900 dark:bg-white dark:text-black border-l border-gray-900 dark:border-white">
                  {COMPARISON.columns.pro}
                </div>
              </div>

              {/* Category groups */}
              {COMPARISON.categories.map((group, groupIndex) => (
                <div key={group.category}>
                  {/* Category header */}
                  <div className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-3 border-b border-gray-200/50 dark:border-zinc-800/50 bg-gray-50/60 dark:bg-zinc-900/40">
                    <div className="px-6 sm:px-8 py-4 col-span-3 sm:col-span-1">
                      <span className="text-xs font-bold tracking-widest text-primary uppercase">
                        {group.category}
                      </span>
                    </div>
                    <div className="hidden sm:block border-l border-gray-200/50 dark:border-zinc-800/50" />
                    <div className="hidden sm:block border-l border-gray-200/50 dark:border-zinc-800/50" />
                  </div>

                  {/* Feature rows */}
                  <div className="divide-y divide-gray-200/50 dark:divide-zinc-800/50">
                    {group.features.map((feature) => {
                      const isProExclusive =
                        feature.free === false ||
                        (typeof feature.free === "string" &&
                          typeof feature.pro === "string" &&
                          feature.free !== feature.pro);

                      return (
                        <div
                          key={feature.name}
                          className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-3 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-900/30"
                        >
                          <div className="px-6 sm:px-8 py-4 sm:py-5 text-sm sm:text-base font-medium text-gray-900 dark:text-gray-200 flex items-center">
                            {feature.name}
                          </div>
                          <div className="px-4 sm:px-8 py-4 sm:py-5 text-center flex items-center justify-center border-l border-gray-200/50 dark:border-zinc-800/50">
                            {typeof feature.free === "boolean" ? (
                              feature.free ? (
                                <Check className="h-5 w-5 sm:h-6 sm:w-6 text-gray-900 dark:text-white" />
                              ) : (
                                <span className="text-gray-300 dark:text-zinc-700 text-lg">
                                  &mdash;
                                </span>
                              )
                            ) : (
                              <span className="text-sm sm:text-base font-light text-gray-600 dark:text-gray-400">
                                {feature.free}
                              </span>
                            )}
                          </div>
                          <div
                            className={`px-4 sm:px-8 py-4 sm:py-5 text-center flex items-center justify-center border-l border-gray-200/50 dark:border-zinc-800/50 ${
                              isProExclusive
                                ? "bg-gray-900/[0.03] dark:bg-white/[0.03]"
                                : ""
                            }`}
                          >
                            {typeof feature.pro === "boolean" ? (
                              feature.pro ? (
                                <div
                                  className={`flex items-center justify-center rounded-full ${
                                    isProExclusive
                                      ? "w-7 h-7 sm:w-8 sm:h-8 bg-gray-900 dark:bg-white"
                                      : ""
                                  }`}
                                >
                                  <Check
                                    className={`h-4 w-4 sm:h-5 sm:w-5 ${
                                      isProExclusive
                                        ? "text-white dark:text-black"
                                        : "text-gray-900 dark:text-white"
                                    }`}
                                  />
                                </div>
                              ) : (
                                <span className="text-gray-300 dark:text-zinc-700 text-lg">
                                  &mdash;
                                </span>
                              )
                            ) : (
                              <span className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                                {feature.pro}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Separator between groups */}
                  {groupIndex < COMPARISON.categories.length - 1 && (
                    <div className="border-b-2 border-gray-200/80 dark:border-zinc-800/80" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 sm:py-32 bg-white dark:bg-black">
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
            <div className="grid lg:grid-cols-12 gap-16">
              <div className="lg:col-span-5">
                <p className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
                  {FAQ.eyebrow}
                </p>
                <h2 className="text-4xl sm:text-5xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1] mb-6">
                  {FAQ.heading}
                </h2>
                <p className="text-lg font-light leading-relaxed text-gray-600 dark:text-gray-400">
                  {FAQ.description}
                </p>
              </div>

              <div className="lg:col-span-7">
                <Accordion className="space-y-4">
                  {FAQ.items.map((faq, index) => (
                    <AccordionItem
                      key={faq.question}
                      value={`item-${index}`}
                      className="bg-gray-50/50 dark:bg-zinc-900/10 rounded-3xl px-8 border border-gray-200/50 dark:border-zinc-800/50"
                    >
                      <AccordionTrigger className="text-lg font-bold tracking-tight text-gray-900 dark:text-white hover:no-underline py-6">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-base font-light leading-relaxed text-gray-600 dark:text-gray-400 pb-6">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative py-24 sm:py-32 bg-gray-50/50 dark:bg-zinc-900/10 border-t border-gray-200/50 dark:border-zinc-800/50">
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[0.95]">
                {CTA.heading}
              </h2>
              <p className="mt-8 text-xl sm:text-2xl text-gray-600 dark:text-gray-400 font-light leading-relaxed">
                {CTA.description}
              </p>
              <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href={CTA.start.href}
                  className="inline-flex h-16 items-center justify-center gap-2 bg-black dark:bg-white px-12 text-lg font-bold tracking-tight text-white dark:text-black hover:scale-105 transition-transform duration-200 rounded-2xl w-full sm:w-auto"
                >
                  {CTA.start.label}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href={CTA.demo.href}
                  className="inline-flex h-16 items-center justify-center gap-2 bg-white dark:bg-zinc-950 border-2 border-gray-200 dark:border-zinc-800 px-12 text-lg font-bold tracking-tight text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors rounded-2xl w-full sm:w-auto"
                >
                  <Play className="h-5 w-5" fill="currentColor" />
                  {CTA.demo.label}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
