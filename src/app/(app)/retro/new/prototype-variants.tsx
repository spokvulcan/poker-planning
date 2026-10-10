"use client";

/**
 * PROTOTYPE, throwaway: five layouts for `/retro/new`, picked by `?variant=`
 * (A–E; no param is the current page), matching `/room/new`'s letters. The
 * page keeps its state and its create; only the rendering differs. Delete
 * once a layout wins.
 */

import type { KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, Link2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrototypeSwitcher, type PrototypeVariant } from "@/components/prototype-switcher";
import { BOARD_DOTS, CeremonyTabs, GridBackdrop, Segmented, StepBadge } from "@/components/prototype-create-shared";
import { STICKY_TONES } from "@/components/retro/sticky-colors";
import { ROOM_NAME } from "@/convex/constants";
import { RETRO_STEPS, RETRO_TEMPLATES, templateById, type RetroTemplate } from "@/convex/retroTemplates";
import { cn } from "@/lib/utils";

export const RETRO_VARIANTS: readonly PrototypeVariant[] = [
  { key: "current", name: "Current" },
  { key: "A", name: "Side-by-side" },
  { key: "B", name: "Template gallery" },
  { key: "C", name: "Quick start" },
  { key: "D", name: "Board-first" },
  { key: "E", name: "Three steps" },
];

/** What the page hands every variant: its state and its two ways out. */
export interface RetroForm {
  name: string;
  setName: (value: string) => void;
  templateId: string;
  setTemplateId: (id: string) => void;
  isRetained: boolean;
  isCreating: boolean;
  create: () => void;
  cancel: () => void;
}

const SHORT_NAMES: Record<string, string> = {
  classic: "Classic",
  "start-stop-continue": "Start · Stop · Continue",
  "mad-sad-glad": "Mad · Sad · Glad",
  "4ls": "4Ls",
  sailboat: "Sailboat",
};

/** How many stickies a preview lane shows, so the boards don't look stamped. */
const LANE_FILL = [3, 2, 2, 1];

const enterCreates = (form: RetroForm) => (event: KeyboardEvent) => {
  if (event.key === "Enter" && !form.isCreating) form.create();
};

// --- Shared pieces -----------------------------------------------------------

function ColumnChip({ column }: { column: RetroTemplate["columns"][number] }) {
  const tone = STICKY_TONES[column.color];
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium", tone.paper, tone.ink)}>
      <span aria-hidden="true">{column.emoji}</span>
      {column.title}
    </span>
  );
}

/** A face-down sticky: the board's scribbles on the column's paper. */
function Sticky({ color, size = "md" }: { color: RetroTemplate["columns"][number]["color"]; size?: "xs" | "md" }) {
  const tone = STICKY_TONES[color];
  return (
    <div className={cn("rounded-md border-2", tone.paper, size === "xs" ? "space-y-1 p-1.5" : "space-y-2 p-3 shadow-sm")}>
      <div className={cn("rounded-full", tone.scribble, size === "xs" ? "h-1 w-4/5" : "h-1.5 w-4/5")} />
      <div className={cn("rounded-full", tone.scribble, size === "xs" ? "h-1 w-1/2" : "h-1.5 w-3/5")} />
      {size === "md" && <div className={cn("h-1.5 w-2/5 rounded-full", tone.scribble)} />}
    </div>
  );
}

/** A miniature board: one lane per column, a few stickies each. */
function MiniBoard({ template }: { template: RetroTemplate }) {
  return (
    <div className="flex h-full gap-2 p-3">
      {template.columns.map((column, i) => {
        const tone = STICKY_TONES[column.color];
        return (
          <div key={column.title} className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg bg-background/70 p-1.5 dark:bg-white/[0.03]">
            <div className={cn("truncate rounded px-1 py-0.5 text-[10px] font-semibold", tone.ink)}>
              <span aria-hidden="true">{column.emoji}</span> {column.title}
            </div>
            {Array.from({ length: LANE_FILL[i % LANE_FILL.length] }, (_, k) => (
              <Sticky key={k} color={column.color} size="xs" />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function RetentionNote({ form, className }: { form: RetroForm; className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)} data-testid="retro-retention-note">
      {form.isRetained ? (
        "Kept on your account until you delete it."
      ) : (
        <>
          Guest retros are removed after 5 quiet days.{" "}
          <Link href="/auth/signin?from=/retro/new" className="underline underline-offset-4 hover:text-foreground">
            Sign in
          </Link>{" "}
          to keep yours.
        </>
      )}
    </p>
  );
}

function NameInput({ form, className, autoFocus }: { form: RetroForm; className?: string; autoFocus?: boolean }) {
  return (
    <Input
      id="retro-name"
      autoFocus={autoFocus}
      placeholder="e.g., Sprint 42 Retro"
      maxLength={ROOM_NAME.maxLength}
      value={form.name}
      onChange={(e) => form.setName(e.target.value)}
      onKeyDown={enterCreates(form)}
      className={cn("h-11 text-base md:text-base", className)}
    />
  );
}

function StartButton({ form, className }: { form: RetroForm; className?: string }) {
  return (
    <Button onClick={form.create} disabled={form.isCreating} className={cn("h-11 px-5 text-sm", className)}>
      {form.isCreating ? "Creating..." : "Start retro"}
      {!form.isCreating && <ArrowRight className="size-4" />}
    </Button>
  );
}

function CopyLinkNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <Link2 className="size-3.5 shrink-0" />
      The invite link is copied for you as soon as the board opens.
    </p>
  );
}

function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border-2 transition",
        on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
      )}
    >
      {on && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

// --- A: Side-by-side ----------------------------------------------------------

function VariantA({ form }: { form: RetroForm }) {
  return (
    <main className="relative isolate flex-1">
      <GridBackdrop id="proto-retro-a" />
      <div className="mx-auto max-w-6xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 sm:pb-24">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <section className="flex flex-col gap-6 border-b p-6 sm:p-8 lg:border-r lg:border-b-0">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">New retro</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">A whiteboard for your team to look back on the sprint.</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="retro-name" className="text-sm font-medium">
                Retro name <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <NameInput form={form} autoFocus />
              <p className="text-xs text-muted-foreground">Leave empty for a dated name.</p>
            </div>
            <div className="mt-auto space-y-4">
              <RetentionNote form={form} />
              <CopyLinkNote />
              <div className="flex gap-3">
                <Button variant="outline" className="h-11 flex-1" onClick={form.cancel}>
                  Cancel
                </Button>
                <StartButton form={form} className="flex-[2]" />
              </div>
            </div>
          </section>

          <section className="p-6 sm:p-8">
            <h2 className="text-sm font-medium">Columns</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Pick a starting point. You can rename, add or remove columns on the board.</p>
            <div role="radiogroup" aria-label="Columns" className="mt-5 grid gap-3 md:grid-cols-2">
              {RETRO_TEMPLATES.map((template) => {
                const on = form.templateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => form.setTemplateId(template.id)}
                    onDoubleClick={form.create}
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border p-4 text-left transition",
                      on ? "border-primary bg-primary/[0.04] ring-1 ring-primary" : "hover:border-foreground/25 hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <RadioDot on={on} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{template.name}</div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{template.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-8">
                      {template.columns.map((column) => (
                        <ColumnChip key={column.title} column={column} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

// --- B: Template gallery -------------------------------------------------------

function VariantB({ form }: { form: RetroForm }) {
  const selected = templateById(form.templateId);
  return (
    <main className="relative isolate flex flex-1 flex-col">
      <GridBackdrop id="proto-retro-b" />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-28 sm:px-6 sm:pt-32">
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">New retro</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">How do you want to look back?</h1>
          </div>
          <div className="w-full space-y-1.5 md:w-80">
            <label htmlFor="retro-name" className="text-sm font-medium">
              Retro name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <NameInput form={form} />
          </div>
        </header>

        <div role="radiogroup" aria-label="Columns" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RETRO_TEMPLATES.map((template) => {
            const on = form.templateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => form.setTemplateId(template.id)}
                onDoubleClick={form.create}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition",
                  on ? "border-primary ring-2 ring-primary" : "hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg"
                )}
              >
                <div className={cn("h-40 border-b", BOARD_DOTS)}>
                  <MiniBoard template={template} />
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{template.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{template.columns.length} columns</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </div>
                {on && (
                  <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
          <div className="flex flex-col justify-center rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Need something else?</span>
            Start from any of these and rename, add or remove columns on the board.
          </div>
        </div>
        <RetentionNote form={form} className="mt-6" />
      </div>

      <div className="sticky bottom-0 z-40 mt-10 border-t bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0 text-sm">
            <div className="truncate font-medium">{form.name.trim() || "Untitled retro"}</div>
            <div className="text-muted-foreground">
              {SHORT_NAMES[selected.id] ?? selected.name} · {selected.columns.length} columns
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" className="h-11" onClick={form.cancel}>
              Cancel
            </Button>
            <StartButton form={form} />
          </div>
        </div>
      </div>
    </main>
  );
}

// --- C: Quick start ------------------------------------------------------------
// One big field and Enter. Below it a board of fixed size shows the columns,
// so switching templates never moves the page; the description and the line
// under the board hold their place too.

function VariantC({ form }: { form: RetroForm }) {
  const selected = templateById(form.templateId);
  const count = selected.columns.length;
  return (
    <main className="relative isolate flex-1">
      <GridBackdrop id="proto-retro-c" />
      <div className="mx-auto max-w-4xl px-4 pt-32 pb-28 sm:px-6 sm:pt-36">
        <CeremonyTabs current="retro" variant="C" />
        <h1 className="mt-8 text-center text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          What are you looking back on?
        </h1>
        <p className="mt-3 text-center text-muted-foreground">Name the retro and press Enter. You can change the rest on the board.</p>

        <div className="mt-10 flex flex-col gap-2 rounded-2xl border bg-card p-2 shadow-xl shadow-black/5 transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-2xl sm:flex-row sm:items-center dark:shadow-black/40">
          <label htmlFor="retro-name" className="sr-only">
            Retro name
          </label>
          <input
            id="retro-name"
            autoFocus
            placeholder="Sprint 42 retro"
            maxLength={ROOM_NAME.maxLength}
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
            onKeyDown={enterCreates(form)}
            className="h-14 min-w-0 flex-1 bg-transparent px-4 text-xl outline-none placeholder:text-muted-foreground/60"
          />
          <StartButton form={form} className="h-12 px-6 text-base" />
        </div>
        <RetentionNote form={form} className="mt-3 h-4 text-center" />

        <section aria-labelledby="columns-heading" className="mt-14 flex flex-col items-center">
          <h2 id="columns-heading" className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Columns
          </h2>
          <div className="mt-3 max-w-full">
            <Segmented
              label="Columns"
              options={RETRO_TEMPLATES.map((t) => ({ value: t.id, label: SHORT_NAMES[t.id] ?? t.name }))}
              value={form.templateId}
              onChange={form.setTemplateId}
            />
          </div>
          <p className="mt-3 h-10 text-center text-sm text-balance text-muted-foreground sm:h-5">{selected.description}</p>

          <div className="mt-4 w-full">
            <div className={cn("relative h-[264px] overflow-hidden rounded-2xl border", BOARD_DOTS)}>
              <div className="h-full overflow-x-auto [scrollbar-width:none]">
                <div
                  key={selected.id}
                  className="grid h-full gap-3 p-4 sm:p-5"
                  style={{ gridTemplateColumns: `repeat(${count}, minmax(7.5rem, 1fr))` }}
                >
                  {selected.columns.map((column, i) => {
                    const tone = STICKY_TONES[column.color];
                    return (
                      <div
                        key={column.title}
                        className="flex flex-col gap-2 rounded-xl border bg-card/70 p-2.5 fill-mode-backwards motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-300"
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        <div className={cn("flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-sm font-semibold", tone.paper, tone.ink)}>
                          <span aria-hidden="true">{column.emoji}</span>
                          <span className="truncate">{column.title}</span>
                        </div>
                        {Array.from({ length: LANE_FILL[i % LANE_FILL.length] }, (_, k) => (
                          <Sticky key={k} color={column.color} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* The board runs on past the frame. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-gray-50 to-transparent dark:from-neutral-950" />
            </div>
            <div className="mt-2.5 flex h-5 items-center justify-between gap-4 px-1 text-xs text-muted-foreground">
              <span className="truncate">You can rename, add or remove columns on the board.</span>
              <span className="shrink-0 tabular-nums">{count} columns</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// --- D: Board-first ------------------------------------------------------------

const STEP_LABELS: Record<(typeof RETRO_STEPS)[number], string> = {
  write: "Write",
  vote: "Vote",
  discuss: "Discuss",
  done: "Done",
};

function VariantD({ form }: { form: RetroForm }) {
  const selected = templateById(form.templateId);
  return (
    <main className={cn("relative isolate flex-1", BOARD_DOTS)}>
      <div className="mx-auto grid min-h-[100svh] max-w-7xl gap-8 px-4 pt-28 pb-16 sm:px-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
        <aside className="rounded-2xl border bg-background/95 p-6 shadow-xl backdrop-blur lg:sticky lg:top-28">
          <h1 className="text-xl font-semibold tracking-tight">New retro</h1>
          <p className="mt-1 text-sm text-muted-foreground">The board on the right is what your team will see.</p>

          <div className="mt-6 space-y-2">
            <label htmlFor="retro-name" className="text-sm font-medium">
              Retro name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <NameInput form={form} autoFocus />
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium">Columns</div>
            <div role="radiogroup" aria-label="Columns" className="mt-2 divide-y rounded-xl border">
              {RETRO_TEMPLATES.map((template) => {
                const on = form.templateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => form.setTemplateId(template.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition first:rounded-t-xl last:rounded-b-xl",
                      on ? "bg-muted" : "hover:bg-muted/50"
                    )}
                  >
                    <RadioDot on={on} />
                    <span className="flex-1 font-medium">{SHORT_NAMES[template.id] ?? template.name}</span>
                    <span className="flex gap-0.5" aria-hidden="true">
                      {template.columns.map((column) => (
                        <span key={column.title} className={cn("size-2.5 rounded-full", STICKY_TONES[column.color].swatch)} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Rename, add or remove columns on the board.</p>
          </div>

          <StartButton form={form} className="mt-6 h-12 w-full text-base" />
          <Button variant="ghost" className="mt-2 h-10 w-full text-muted-foreground" onClick={form.cancel}>
            Cancel
          </Button>
          <RetentionNote form={form} className="mt-3 text-center" />
        </aside>

        <section aria-label="Preview" className="flex min-w-0 flex-col gap-6 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="rounded-xl border bg-card px-4 py-2.5 shadow-sm">
              <div className={cn("font-semibold", !form.name.trim() && "text-muted-foreground")}>{form.name.trim() || "Untitled retro"}</div>
            </div>
            <ol className="flex rounded-full border bg-card p-1 text-xs font-medium shadow-sm">
              {RETRO_STEPS.map((step, i) => (
                <li
                  key={step}
                  className={cn("rounded-full px-3 py-1", i === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                  {STEP_LABELS[step]}
                </li>
              ))}
            </ol>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selected.columns.length}, minmax(0, 1fr))` }}>
            {selected.columns.map((column, i) => {
              const tone = STICKY_TONES[column.color];
              return (
                <div key={column.title} className="flex min-h-[420px] flex-col gap-3 rounded-2xl border bg-card/80 p-3 shadow-sm backdrop-blur">
                  <div className={cn("truncate rounded-lg border-2 px-3 py-2 text-sm font-semibold", tone.paper, tone.ink)}>
                    <span aria-hidden="true">{column.emoji}</span> {column.title}
                  </div>
                  {Array.from({ length: LANE_FILL[i % LANE_FILL.length] + 1 }, (_, k) => (
                    <Sticky key={k} color={column.color} />
                  ))}
                  <div className="mt-auto rounded-md border-2 border-dashed py-2 text-center text-xs text-muted-foreground">+ Add a sticky</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

// --- E: Three steps ------------------------------------------------------------

function Step({
  n,
  title,
  hint,
  done,
  children,
  emphasized,
}: {
  n: number;
  title: string;
  hint?: string;
  done: boolean;
  children: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <li className={cn("flex flex-col rounded-2xl border bg-card p-6", emphasized && "border-foreground/20 shadow-lg")}>
      <div className="flex items-center gap-3">
        <StepBadge n={n} done={done} />
        <h2 className="font-semibold">{title}</h2>
        {hint && <span className="ml-auto text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </li>
  );
}

function VariantE({ form }: { form: RetroForm }) {
  const selected = templateById(form.templateId);
  return (
    <main className="relative isolate flex-1">
      <GridBackdrop id="proto-retro-e" />
      <div className="mx-auto max-w-6xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 sm:pb-24">
        <header className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">New retro</h1>
          <p className="mt-2 text-muted-foreground">Three quick steps. Only the last one is required.</p>
        </header>
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          <Step n={1} title="Name it" hint="Optional" done={!!form.name.trim()}>
            <label htmlFor="retro-name" className="sr-only">
              Retro name
            </label>
            <NameInput form={form} autoFocus />
            <p className="mt-2 text-xs text-muted-foreground">Shown at the top of the board. Leave empty for a dated name.</p>
          </Step>

          <Step n={2} title="Pick the columns" done>
            <div role="radiogroup" aria-label="Columns" className="space-y-2">
              {RETRO_TEMPLATES.map((template) => {
                const on = form.templateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => form.setTemplateId(template.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                      on ? "border-primary bg-primary/[0.04] ring-1 ring-primary" : "hover:bg-muted/50"
                    )}
                  >
                    <RadioDot on={on} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{SHORT_NAMES[template.id] ?? template.name}</span>
                      <span className="block text-xs text-muted-foreground">{template.description}</span>
                    </span>
                    <span className="flex gap-0.5" aria-hidden="true">
                      {template.columns.map((column) => (
                        <span key={column.title} className="text-sm">
                          {column.emoji}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </Step>

          <Step n={3} title="Start" done={false} emphasized>
            <div className="rounded-xl bg-muted/50 p-4">
              <div className={cn("truncate font-medium", !form.name.trim() && "text-muted-foreground")}>{form.name.trim() || "Untitled retro"}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selected.columns.map((column) => (
                  <ColumnChip key={column.title} column={column} />
                ))}
              </div>
            </div>
            <CopyLinkNote className="mt-4" />
            <RetentionNote form={form} className="mt-2" />
            <div className="mt-auto pt-6">
              <StartButton form={form} className="h-12 w-full text-base" />
              <Button variant="ghost" className="mt-2 h-10 w-full text-muted-foreground" onClick={form.cancel}>
                Cancel
              </Button>
            </div>
          </Step>
        </ol>
      </div>
    </main>
  );
}

// --- The page ------------------------------------------------------------------

export function RetroPrototype({ variant, form }: { variant: string; form: RetroForm }) {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Navbar />
      {variant === "A" && <VariantA form={form} />}
      {variant === "B" && <VariantB form={form} />}
      {variant === "C" && <VariantC form={form} />}
      {variant === "D" && <VariantD form={form} />}
      {variant === "E" && <VariantE form={form} />}
      <Footer />
      <PrototypeSwitcher variants={RETRO_VARIANTS} current={variant} />
    </div>
  );
}
