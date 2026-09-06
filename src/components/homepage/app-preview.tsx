"use client";

import Image from "next/image";
import { useState, type ComponentType } from "react";
import { Zap, Shield, BarChart3, PenLine, EyeOff, History } from "lucide-react";
import { APP_PREVIEW } from "./copy";
import { CeremonyTabs, CeremonyTabList, CeremonyTabPanel, type Ceremony } from "./ceremony-tabs";

type FeatureId =
  | (typeof APP_PREVIEW.poker.features)[number]["id"]
  | (typeof APP_PREVIEW.retro.features)[number]["id"];

// Icons are keyed by the copy's ids; the words live in copy.ts.
const ICONS: Record<FeatureId, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  friction: Zap,
  unbiased: Shield,
  results: BarChart3,
  parallel: PenLine,
  anonymous: EyeOff,
  history: History,
};

const CEREMONIES: Ceremony[] = ["poker", "retro"];

/** Both boards (spec §18.2): the retro slot ships with the poker image until the manual capture. */
export function AppPreview() {
  const [ceremony, setCeremony] = useState<Ceremony>("poker");
  const slot = APP_PREVIEW[ceremony];

  return (
    <section id="app-preview" className="bg-white dark:bg-black py-24 sm:py-32">
      <CeremonyTabs
        value={ceremony}
        onValueChange={setCeremony}
        className="mx-auto max-w-[90rem] px-6 lg:px-8"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 items-center">

          <div className="lg:col-span-5 flex flex-col">
            <h2 className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
              {APP_PREVIEW.eyebrow}
            </h2>
            <h3 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1] mb-6">
              {APP_PREVIEW.heading}
            </h3>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 font-light mb-8">
              {APP_PREVIEW.description}
            </p>

            <CeremonyTabList
              prefix="app-preview"
              labels={APP_PREVIEW.tabs}
              className="self-start mb-12"
            />

            <div key={ceremony} className="space-y-8 animate-in fade-in duration-300">
              {slot.features.map((feature) => {
                const Icon = ICONS[feature.id];
                return (
                  <div key={feature.id} className="flex gap-4">
                    <div className="mt-1 flex-shrink-0 p-3 bg-gray-50 dark:bg-zinc-900 rounded-2xl h-fit">
                      <Icon className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2} />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">
                        {feature.name}
                      </h4>
                      <p className="text-base text-gray-600 dark:text-gray-400 font-light leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-7 relative">
            {CEREMONIES.map((c) => (
              <CeremonyTabPanel key={c} value={c}>
                <PreviewFrame image={APP_PREVIEW[c].image} />
              </CeremonyTabPanel>
            ))}
          </div>

        </div>
      </CeremonyTabs>
    </section>
  );
}

function PreviewFrame({ image }: { image: { light: string; dark: string; alt: string } }) {
  return (
    <div className="relative w-full aspect-square sm:aspect-video lg:aspect-[4/3] rounded-[2rem] overflow-hidden border border-gray-200/80 dark:border-zinc-800/80 bg-white dark:bg-black flex flex-col ring-1 ring-inset ring-black/5 dark:ring-white/5">
      {/* macOS style browser header */}
      <div className="flex items-center gap-2 px-4 h-6 sm:h-8 bg-gray-50/80 dark:bg-zinc-900/80 border-b border-gray-200/50 dark:border-zinc-800/50 backdrop-blur-md shrink-0">
        <div className="flex gap-1.5 sm:gap-2">
          <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-400 dark:bg-red-500"></div>
          <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-amber-400 dark:bg-amber-500"></div>
          <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-400 dark:bg-green-500"></div>
        </div>
      </div>
      {/* Simulated Glass overlay on top of image container */}
      <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-black/5 dark:ring-white/5 rounded-[2rem] z-10"></div>
      <div className="relative flex-1 w-full bg-white dark:bg-black">
        <Image
          alt={image.alt}
          src={image.light}
          fill
          className="object-cover object-left-top dark:hidden"
          sizes="(max-width: 1024px) 100vw, 60vw"
          priority
        />
        <Image
          alt={image.alt}
          src={image.dark}
          fill
          className="object-cover object-left-top hidden dark:block"
          sizes="(max-width: 1024px) 100vw, 60vw"
          priority
        />
      </div>
    </div>
  );
}
