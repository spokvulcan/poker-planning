"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The page's one field: the room's name, which starts the room on Enter. */
export interface QuickStart {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  submitLabel: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}

/**
 * The frame both create pages share, `/room/new` and `/retro/new`: a switch
 * between the two, a question, one big name field that starts the room on
 * Enter, and below it the one choice the ceremony asks for. Everything else
 * is left for the board.
 */
export function CreatePage({
  ceremony,
  title,
  subtitle,
  quickStart,
  caption,
  children,
}: {
  ceremony: "poker" | "retro";
  title: string;
  subtitle: string;
  quickStart: QuickStart;
  caption: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Navbar />

      <main className="relative isolate flex-1">
        <GridBackdrop />

        <div className="mx-auto max-w-4xl px-4 pt-32 pb-24 sm:px-6 sm:pt-36">
          <CeremonySwitch current={ceremony} />
          <h1 className="mt-8 text-center text-4xl leading-[0.95] font-bold tracking-tighter text-balance sm:text-5xl">{title}</h1>
          <p className="mt-3 text-center text-muted-foreground">{subtitle}</p>
          <QuickStartField {...quickStart} />
          <div className="mt-3 min-h-4 text-center text-xs text-muted-foreground">{caption}</div>
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}

function QuickStartField({
  id,
  label,
  placeholder,
  value,
  maxLength,
  onChange,
  submitLabel,
  isSubmitting,
  canSubmit,
  onSubmit,
}: QuickStart) {
  return (
    <div className="mt-10 flex flex-col gap-2 rounded-2xl bg-card p-2 ring-1 ring-foreground/10 transition-shadow focus-within:shadow-lg focus-within:ring-[3px] focus-within:ring-ring/50 sm:flex-row sm:items-center">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        autoFocus
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && canSubmit) onSubmit();
        }}
        className="h-14 min-w-0 flex-1 bg-transparent px-4 text-xl outline-none placeholder:text-muted-foreground/60"
      />
      <Button onClick={onSubmit} disabled={!canSubmit} className="h-12 px-6 text-base">
        {isSubmitting ? "Creating..." : submitLabel}
        {!isSubmitting && <ArrowRight className="size-4" />}
      </Button>
    </div>
  );
}

/** Planning poker | Retro: the other create page is one click away. */
function CeremonySwitch({ current }: { current: "poker" | "retro" }) {
  const tab = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-full px-4 py-1.5 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
      active ? "bg-background text-foreground shadow-sm dark:bg-surface-3" : "text-muted-foreground hover:text-foreground"
    );
  return (
    <nav aria-label="What to start" className="mx-auto flex w-fit rounded-full bg-muted/60 p-1 text-sm font-medium ring-1 ring-foreground/10">
      <Link href="/room/new" className={tab(current === "poker")} aria-current={current === "poker" ? "page" : undefined}>
        <span aria-hidden="true">🃏</span> Planning poker
      </Link>
      <Link href="/retro/new" className={tab(current === "retro")} aria-current={current === "retro" ? "page" : undefined}>
        <span aria-hidden="true">🗒️</span> Retro
      </Link>
    </nav>
  );
}

function GridBackdrop() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full [mask-image:radial-gradient(100%_100%_at_top_center,white,transparent)] stroke-gray-200 dark:stroke-white/10"
        aria-hidden="true"
      >
        <defs>
          <pattern id="create-pattern" width={200} height={200} x="50%" y={-1} patternUnits="userSpaceOnUse">
            <path d="M100 200V.5M.5 .5H200" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" strokeWidth={0} fill="url(#create-pattern)" />
      </svg>
    </div>
  );
}
