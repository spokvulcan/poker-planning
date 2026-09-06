"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowRight, Check } from "lucide-react";
import { PRICING_SECTION } from "./copy";

const { tiers } = PRICING_SECTION;

export function PricingSection() {
  return (
    <section id="pricing" className="bg-white dark:bg-black py-24 sm:py-32">
      <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <h2 className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
            {PRICING_SECTION.eyebrow}
          </h2>
          <h3 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1] mb-6">
            {PRICING_SECTION.heading}
          </h3>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 font-light max-w-xl">
            {PRICING_SECTION.description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl">
          {tiers.map((tier, index) => (
            <div
              key={tier.id}
              className={cn(
                "flex flex-col p-10 rounded-[2rem] border relative overflow-hidden transition-all duration-300",
                index === 1
                  ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black shadow-xl scale-100 md:scale-105 z-10"
                  : "border-gray-200/50 dark:border-zinc-800/50 bg-gray-50/50 dark:bg-zinc-900/10 hover:bg-white dark:hover:bg-zinc-900/30",
              )}
            >
              {tier.disabled && (
                <div className="absolute top-6 right-6 px-4 py-1.5 bg-white/20 dark:bg-black/10 backdrop-blur-md rounded-full text-xs font-bold tracking-wider uppercase">
                  {PRICING_SECTION.badge}
                </div>
              )}

              <div className="mb-8">
                <h4
                  className={cn(
                    "text-2xl font-bold mb-4",
                    index === 1
                      ? "text-white dark:text-black"
                      : "text-gray-900 dark:text-white",
                  )}
                >
                  {tier.name}
                </h4>
                <div className="flex items-baseline gap-2 mb-6 h-14">
                  <span
                    className={cn(
                      "text-5xl sm:text-6xl font-bold tracking-tighter",
                      index === 1
                        ? "text-white dark:text-black"
                        : "text-gray-900 dark:text-white",
                    )}
                  >
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span
                      className={cn(
                        "text-lg font-medium",
                        index === 1
                          ? "text-gray-300 dark:text-gray-600"
                          : "text-gray-500",
                      )}
                    >
                      /{tier.period}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "text-lg font-light leading-relaxed",
                    index === 1
                      ? "text-gray-300 dark:text-gray-700"
                      : "text-gray-600 dark:text-gray-400",
                  )}
                >
                  {tier.description}
                </p>
              </div>

              <ul className="space-y-5 mb-10 flex-1">
                {tier.features.map((feature, fIndex) => (
                  <li
                    key={feature}
                    className={cn(
                      "flex items-start gap-4 text-base",
                      index === 1
                        ? "text-gray-200 dark:text-gray-800"
                        : "text-gray-900 dark:text-gray-300",
                    )}
                  >
                    {fIndex === 0 && index === 1 ? (
                      <span
                        className={cn(
                          "font-bold",
                          index === 1
                            ? "text-white dark:text-black"
                            : "text-gray-900 dark:text-white",
                        )}
                      >
                        {feature}
                      </span>
                    ) : (
                      <>
                        <div className={cn(
                          "flex items-center justify-center w-6 h-6 rounded-full shrink-0",
                          index === 1 
                            ? "bg-white/20 dark:bg-black/10" 
                            : "bg-gray-200/50 dark:bg-zinc-800/50"
                        )}>
                          <Check
                            className={cn(
                              "h-3.5 w-3.5",
                              index === 1
                                ? "text-white dark:text-black"
                                : "text-gray-900 dark:text-white",
                            )}
                          />
                        </div>
                        <span className="font-medium">{feature}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {tier.disabled ? (
                <div
                  className={cn(
                    "inline-flex h-16 items-center justify-center px-8 text-lg font-bold tracking-tight rounded-2xl cursor-not-allowed opacity-70",
                    index === 1
                      ? "bg-white/20 dark:bg-black/10 text-white dark:text-black"
                      : "bg-gray-100 dark:bg-zinc-900 text-gray-900 dark:text-white",
                  )}
                >
                  {tier.cta}
                </div>
              ) : (
                <Link
                  href={tier.href}
                  className={cn(
                    "inline-flex h-16 items-center justify-center px-8 text-lg font-bold tracking-tight transition-all rounded-2xl group",
                    index === 1
                      ? "bg-white dark:bg-black text-black dark:text-white hover:scale-105"
                      : "bg-black dark:bg-white text-white dark:text-black hover:scale-105",
                  )}
                >
                  {tier.cta}
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
