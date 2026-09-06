import Link from "next/link";
import { Check } from "lucide-react";
import { CAPABILITIES } from "./copy";

export function FeaturesSection() {
  return (
    <section className="bg-gray-50/50 dark:bg-zinc-900/10 py-24 sm:py-32">
      <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">

          <div>
            <h2 className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
              {CAPABILITIES.eyebrow}
            </h2>
            <h3 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1] mb-6">
              {CAPABILITIES.heading}<br />
              <span className="text-gray-400 dark:text-zinc-600">{CAPABILITIES.headingMuted}</span>
            </h3>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 font-light mb-8 max-w-md">
              {CAPABILITIES.description}
            </p>
            <Link
              href={CAPABILITIES.cta.href}
              className="inline-flex h-14 items-center justify-center gap-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 px-8 text-base font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-2xl"
            >
              {CAPABILITIES.cta.label}
            </Link>
          </div>

          <div className="bg-white dark:bg-black rounded-3xl p-8 sm:p-12 border border-gray-200/50 dark:border-zinc-800/50 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-10">
            {[CAPABILITIES.poker, CAPABILITIES.retro].map((group) => (
              <div key={group.name}>
                <h4 className="text-xs font-bold tracking-widest text-primary uppercase mb-6">
                  {group.name}
                </h4>
                <ul className="space-y-5">
                  {group.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-gray-50 dark:bg-zinc-900 rounded-full">
                        <Check className="h-5 w-5 text-gray-900 dark:text-white" strokeWidth={2.5} />
                      </div>
                      <span className="text-lg font-medium text-gray-900 dark:text-gray-100">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
