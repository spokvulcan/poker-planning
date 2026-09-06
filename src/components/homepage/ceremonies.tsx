import Link from "next/link";
import { ArrowRight, Check, Play } from "lucide-react";
import { CEREMONIES } from "./copy";

/**
 * Two ceremonies, one toolkit (spec §18.2, ADR-0014): one card per ceremony
 * directly under the hero, each with its own CTA. The poker card carries the
 * Interactive Demo; there is no retro demo.
 */
export function Ceremonies() {
  const { poker, retro } = CEREMONIES;
  return (
    <section id="toolkit" className="bg-white dark:bg-black py-24 sm:py-32 border-t border-gray-100 dark:border-zinc-900">
      <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <h2 className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
            {CEREMONIES.eyebrow}
          </h2>
          <p className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1] mb-6">
            {CEREMONIES.heading}<br />
            <span className="text-gray-400 dark:text-zinc-600">{CEREMONIES.headingMuted}</span>
          </p>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 font-light">
            {CEREMONIES.description}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CeremonyCard
            name={poker.name}
            description={poker.description}
            points={poker.points}
            testId="toolkit-card-poker"
          >
            <Link
              href={poker.cta.href}
              className="inline-flex h-14 items-center justify-center gap-2 bg-black dark:bg-white px-8 text-base font-bold tracking-tight text-white dark:text-black hover:scale-105 transition-transform duration-200 rounded-2xl w-full sm:w-auto"
            >
              {poker.cta.label}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href={poker.demo.href}
              className="inline-flex h-14 items-center justify-center gap-2 bg-white dark:bg-zinc-950 border-2 border-gray-200 dark:border-zinc-800 px-8 text-base font-bold tracking-tight text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors rounded-2xl w-full sm:w-auto"
            >
              <Play className="h-5 w-5" fill="currentColor" />
              {poker.demo.label}
            </Link>
          </CeremonyCard>

          <CeremonyCard
            name={retro.name}
            description={retro.description}
            points={retro.points}
            testId="toolkit-card-retro"
          >
            <Link
              href={retro.cta.href}
              className="inline-flex h-14 items-center justify-center gap-2 bg-black dark:bg-white px-8 text-base font-bold tracking-tight text-white dark:text-black hover:scale-105 transition-transform duration-200 rounded-2xl w-full sm:w-auto"
            >
              {retro.cta.label}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </CeremonyCard>
        </div>
      </div>
    </section>
  );
}

function CeremonyCard({
  name,
  description,
  points,
  testId,
  children,
}: {
  name: string;
  description: string;
  points: readonly string[];
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col p-8 sm:p-10 rounded-[2rem] bg-gray-50/50 dark:bg-surface-1 border border-gray-200/50 dark:border-zinc-800/50"
    >
      <h3 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
        {name}
      </h3>
      <p className="text-lg text-gray-600 dark:text-gray-400 font-light leading-relaxed mb-8">
        {description}
      </p>
      <ul className="space-y-3 mb-10 flex-1">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-3 text-base font-medium text-gray-900 dark:text-gray-200">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200/50 dark:bg-zinc-800/50">
              <Check className="h-3.5 w-3.5 text-gray-900 dark:text-white" />
            </span>
            {point}
          </li>
        ))}
      </ul>
      <div className="flex flex-col sm:flex-row gap-4">{children}</div>
    </div>
  );
}
