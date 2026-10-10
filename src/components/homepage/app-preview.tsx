"use client";

import Image from "next/image";
import { useState, type ComponentType } from "react";
import { Zap, Shield, BarChart3, PenLine, EyeOff, ListChecks, Lock } from "lucide-react";
import { APP_PREVIEW } from "./copy";
import { CeremonyTabs, CeremonyTabList, CeremonyTabPanel, type Ceremony } from "./ceremony-tabs";
import { cn } from "@/lib/utils";

type FeatureId =
  | (typeof APP_PREVIEW.poker.features)[number]["id"]
  | (typeof APP_PREVIEW.retro.features)[number]["id"];

// Icons are keyed by the copy's ids; the words live in copy.ts.
const ICONS: Record<FeatureId, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  friction: Zap,
  unbiased: Shield,
  results: BarChart3,
  parallel: PenLine,
  names: EyeOff,
  carryover: ListChecks,
};

const CEREMONIES: Ceremony[] = ["poker", "retro"];

/** Every board screenshot is captured at this size, so the frame takes its shape and never crops. */
const SHOT = { width: 3454, height: 1992 };

/** The glow behind the window, in the colour of the board's session node. */
const GLOW: Record<Ceremony, string> = {
  poker: "bg-blue-500/15 dark:bg-blue-500/20",
  retro: "bg-emerald-500/15 dark:bg-emerald-500/20",
};

/** Both boards (spec §18.2), each captured in light and dark. */
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] gap-16 xl:gap-20 items-center">

          <div className="flex flex-col">
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

          <div className="relative">
            {CEREMONIES.map((c) => (
              <CeremonyTabPanel key={c} value={c}>
                <PreviewFrame image={APP_PREVIEW[c].image} glow={GLOW[c]} />
              </CeremonyTabPanel>
            ))}
          </div>

        </div>
      </CeremonyTabs>
    </section>
  );
}

function PreviewFrame({
  image,
  glow,
}: {
  image: { light: string; dark: string; alt: string };
  glow: string;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className={cn("pointer-events-none absolute -inset-x-[4%] -inset-y-[8%] rounded-[50%] blur-3xl", glow)}
      />
      <figure className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl shadow-gray-900/10 dark:shadow-black/50">
        {/* macOS style window bar */}
        <div className="relative flex items-center h-7 sm:h-10 px-3 sm:px-4 bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
          <div className="flex gap-1.5 sm:gap-2">
            <div className="size-2 sm:size-3 rounded-full bg-[#ff5f57]" />
            <div className="size-2 sm:size-3 rounded-full bg-[#febc2e]" />
            <div className="size-2 sm:size-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 h-4 sm:h-6 px-3 sm:px-10 rounded-md bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-[9px] sm:text-xs font-medium text-gray-500 dark:text-zinc-400">
            <Lock className="size-2 sm:size-3" strokeWidth={2.5} />
            {APP_PREVIEW.address}
          </div>
        </div>
        <Image
          alt={image.alt}
          src={image.light}
          width={SHOT.width}
          height={SHOT.height}
          className="block w-full h-auto dark:hidden"
          sizes="(min-width: 1440px) 820px, (min-width: 1024px) 60vw, 100vw"
        />
        <Image
          alt={image.alt}
          src={image.dark}
          width={SHOT.width}
          height={SHOT.height}
          className="hidden w-full h-auto dark:block"
          sizes="(min-width: 1440px) 820px, (min-width: 1024px) 60vw, 100vw"
        />
      </figure>
    </div>
  );
}
