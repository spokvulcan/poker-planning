"use client";

/**
 * PROTOTYPE, throwaway: five layouts for `/room/new`, picked by `?variant=`
 * (A–E; no param is the current page). The page keeps its state and its
 * create; only the rendering differs. Delete once a layout wins.
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ArrowRight, Check, Link2, Plus, X } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field";
import { PrototypeSwitcher, type PrototypeVariant } from "@/components/prototype-switcher";
import { BOARD_DOTS, CeremonyTabs, GridBackdrop, Segmented, StepBadge } from "@/components/prototype-create-shared";
import { SCALE_VALIDATION, VOTING_SCALES, type VotingScaleType } from "@/convex/scales";
import { ROOM_NAME } from "@/convex/constants";
import { cn } from "@/lib/utils";

export const POKER_VARIANTS: readonly PrototypeVariant[] = [
  { key: "current", name: "Current" },
  { key: "A", name: "Side-by-side" },
  { key: "B", name: "Template gallery" },
  { key: "C", name: "Quick start" },
  { key: "D", name: "Board-first" },
  { key: "E", name: "Three steps" },
];

export type ScaleChoice = VotingScaleType | "custom";

/** What the page hands every variant: its state and its two ways out. */
export interface PokerForm {
  roomName: string;
  setRoomName: (value: string) => void;
  scale: ScaleChoice;
  setScale: (scale: ScaleChoice) => void;
  customCards: string;
  setCustomCards: (value: string) => void;
  customError: string | null;
  isCreating: boolean;
  canCreate: boolean;
  create: () => void;
  cancel: () => void;
}

const SCALES: { key: ScaleChoice; label: string; short: string; blurb: string }[] = [
  { key: "fibonacci", label: "Fibonacci", short: "Fibonacci", blurb: "The usual choice. Gaps widen as uncertainty grows." },
  { key: "standard", label: "Standard", short: "Standard", blurb: "Fibonacci with half points and round big numbers." },
  { key: "tshirt", label: "T-Shirt Sizes", short: "T-shirt", blurb: "Rough sizing for roadmaps and early refinement." },
  {
    key: "custom",
    label: "Custom Scale",
    short: "Custom",
    blurb: `Your own deck: ${SCALE_VALIDATION.minCards} to ${SCALE_VALIDATION.maxCards} cards, up to ${SCALE_VALIDATION.maxCardLength} characters each.`,
  },
];

const scaleOf = (key: ScaleChoice) => SCALES.find((s) => s.key === key)!;

function cardsOf(scale: ScaleChoice, customCards: string): string[] {
  if (scale !== "custom") return [...VOTING_SCALES[scale].cards];
  return customCards
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** A few cards from the middle of a deck, for fans and thumbnails. */
function sampleOf(scale: ScaleChoice, customCards: string): string[] {
  if (scale === "tshirt") return VOTING_SCALES.tshirt.cards.slice(0, 5);
  if (scale === "custom") return cardsOf("custom", customCards).slice(0, 5);
  return VOTING_SCALES[scale].cards.slice(1, 6);
}

const enterCreates = (form: PokerForm) => (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === "Enter" && form.canCreate) form.create();
};

// --- Shared pieces -----------------------------------------------------------

const CARD_SIZES = {
  xs: "h-7 min-w-5 px-1 rounded border text-[11px]",
  sm: "h-10 min-w-7 px-1 rounded-md border text-xs",
  md: "h-16 min-w-11 px-1.5 rounded-lg border-2 text-lg",
  lg: "h-24 min-w-16 px-2 rounded-xl border-2 text-2xl",
  table: "h-11 min-w-8 px-1 rounded-lg border-2 text-sm sm:h-16 sm:min-w-11 sm:px-1.5 sm:rounded-xl sm:text-lg",
};

/** A card as the board deals it (VotingCardNode's look). */
function PlayingCard({
  value,
  size = "md",
  raised,
  dashed,
  className,
  style,
}: {
  value: string;
  size?: keyof typeof CARD_SIZES;
  raised?: boolean;
  dashed?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold shadow-sm transition-transform",
        CARD_SIZES[size],
        raised
          ? "-translate-y-2 border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-500/30 dark:border-blue-400 dark:bg-blue-600"
          : "border-gray-300 bg-white text-gray-900 dark:border-border dark:bg-surface-1 dark:text-gray-100",
        dashed && "border-dashed bg-transparent text-muted-foreground shadow-none dark:bg-transparent",
        className
      )}
    >
      {value}
    </span>
  );
}

function Deck({
  cards,
  size,
  raise,
  className,
}: {
  cards: string[];
  size?: keyof typeof CARD_SIZES;
  raise?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {cards.map((card, i) => (
        <PlayingCard key={i} value={card} size={size} raised={raise === i} />
      ))}
    </div>
  );
}

/** Custom cards when none are typed yet. */
function EmptyDeck({ size }: { size?: keyof typeof CARD_SIZES }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {["1", "2", "3", "?"].map((card) => (
        <PlayingCard key={card} value={card} size={size} dashed />
      ))}
      <PlayingCard value="+" size={size} dashed />
    </div>
  );
}

function CustomScaleField({ form, autoFocus }: { form: PokerForm; autoFocus?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="custom-cards" className="text-sm font-medium">
        Your cards
      </label>
      <Input
        id="custom-cards"
        autoFocus={autoFocus}
        placeholder="1, 2, 3, 5, 8, ?, ☕"
        value={form.customCards}
        onChange={(e) => form.setCustomCards(e.target.value)}
        onKeyDown={enterCreates(form)}
        aria-invalid={!!form.customError}
        className="h-10 font-mono"
      />
      {form.customError ? (
        <FieldError>{form.customError}</FieldError>
      ) : (
        <p className="text-xs text-muted-foreground">
          Separate with commas. {SCALE_VALIDATION.minCards} to {SCALE_VALIDATION.maxCards} cards, up to{" "}
          {SCALE_VALIDATION.maxCardLength} characters each.
        </p>
      )}
    </div>
  );
}

function NameInput({ form, className, autoFocus }: { form: PokerForm; className?: string; autoFocus?: boolean }) {
  return (
    <Input
      id="room-name"
      autoFocus={autoFocus}
      placeholder="e.g., Sprint 42 Planning"
      maxLength={ROOM_NAME.maxLength}
      value={form.roomName}
      onChange={(e) => form.setRoomName(e.target.value)}
      onKeyDown={enterCreates(form)}
      className={cn("h-11 text-base md:text-base", className)}
    />
  );
}

function CreateButton({ form, className, label = "Create game" }: { form: PokerForm; className?: string; label?: string }) {
  return (
    <Button onClick={form.create} disabled={!form.canCreate} className={cn("h-11 px-5 text-sm", className)}>
      {form.isCreating ? "Creating..." : label}
      {!form.isCreating && <ArrowRight className="size-4" />}
    </Button>
  );
}

function CopyLinkNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <Link2 className="size-3.5 shrink-0" />
      The invite link is copied for you as soon as the game opens.
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
// The current content, wide: the name and the start on the left, every scale
// with its whole deck on the right, nothing truncated.

function VariantA({ form }: { form: PokerForm }) {
  return (
    <main className="relative isolate flex-1">
      <GridBackdrop id="proto-poker-a" />
      <div className="mx-auto max-w-6xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 sm:pb-24">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <section className="flex flex-col gap-6 border-b p-6 sm:p-8 lg:border-r lg:border-b-0">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">New planning poker game</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Name it, pick the cards, share the link.</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="room-name" className="text-sm font-medium">
                Game name <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <NameInput form={form} autoFocus />
              <p className="text-xs text-muted-foreground">Leave empty and we name it after the time it starts.</p>
            </div>
            <div className="mt-auto space-y-4">
              <CopyLinkNote />
              <div className="flex gap-3">
                <Button variant="outline" className="h-11 flex-1" onClick={form.cancel}>
                  Cancel
                </Button>
                <CreateButton form={form} className="flex-[2]" />
              </div>
            </div>
          </section>

          <section className="p-6 sm:p-8">
            <h2 className="text-sm font-medium">Voting scale</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">How your team estimates. Every card in the deck is shown.</p>
            <div role="radiogroup" aria-label="Voting scale" className="mt-5 grid gap-3 md:grid-cols-2">
              {SCALES.map((s) => {
                const on = form.scale === s.key;
                const cards = cardsOf(s.key, form.customCards);
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => form.setScale(s.key)}
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border p-4 text-left transition",
                      on ? "border-primary bg-primary/[0.04] ring-1 ring-primary" : "hover:border-foreground/25 hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <RadioDot on={on} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{s.label}</span>
                          {s.key !== "custom" && <span className="text-xs text-muted-foreground">{cards.length} cards</span>}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{s.blurb}</p>
                      </div>
                    </div>
                    <div className="pl-8">
                      {s.key === "custom" && cards.length === 0 ? <EmptyDeck size="xs" /> : <Deck cards={cards} size="xs" className="gap-1" />}
                    </div>
                  </button>
                );
              })}
            </div>
            {form.scale === "custom" && (
              <div className="mt-5 rounded-xl border bg-muted/30 p-4">
                <CustomScaleField form={form} autoFocus />
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

// --- B: Template gallery -------------------------------------------------------
// Big visual tiles, like a template picker. The name sits in the header; the
// start stays in reach in a bar pinned to the bottom of the window.

function Fan({ cards, dashed }: { cards: string[]; dashed?: boolean }) {
  const mid = (cards.length - 1) / 2;
  return (
    <div className="relative h-full w-full">
      {cards.map((card, i) => {
        const off = i - mid;
        return (
          <PlayingCard
            key={i}
            value={card}
            size="md"
            dashed={dashed}
            className="absolute bottom-5 left-1/2 origin-bottom"
            style={{
              transform: `translateX(calc(-50% + ${off * 30}px)) translateY(${Math.abs(off) * 5}px) rotate(${off * 8}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

function VariantB({ form }: { form: PokerForm }) {
  const selected = scaleOf(form.scale);
  const cards = cardsOf(form.scale, form.customCards);
  return (
    <main className="relative isolate flex flex-1 flex-col">
      <GridBackdrop id="proto-poker-b" />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-28 sm:px-6 sm:pt-32">
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">New planning poker game</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Pick the cards your team votes with</h1>
          </div>
          <div className="w-full space-y-1.5 md:w-80">
            <label htmlFor="room-name" className="text-sm font-medium">
              Game name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <NameInput form={form} />
          </div>
        </header>

        <div role="radiogroup" aria-label="Voting scale" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SCALES.map((s) => {
            const on = form.scale === s.key;
            const sample = sampleOf(s.key, form.customCards);
            const count = cardsOf(s.key, form.customCards).length;
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => form.setScale(s.key)}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition",
                  on ? "border-primary ring-2 ring-primary" : "hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg"
                )}
              >
                <div className={cn("relative h-40 border-b", BOARD_DOTS)}>
                  {s.key === "custom" && sample.length === 0 ? (
                    <div className="grid h-full place-items-center">
                      <span className="grid size-14 place-items-center rounded-xl border-2 border-dashed text-muted-foreground">
                        <Plus className="size-6" />
                      </span>
                    </div>
                  ) : (
                    <Fan cards={sample} />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{s.label}</span>
                    {count > 0 && <span className="text-xs text-muted-foreground">{count} cards</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">{s.blurb}</p>
                </div>
                {on && (
                  <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <section className="mt-6 rounded-2xl border bg-card p-6">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-start">
            {form.scale === "custom" ? (
              <CustomScaleField form={form} autoFocus />
            ) : (
              <div>
                <h2 className="font-medium">The {selected.label} deck</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Everyone gets these {cards.length} cards. <span className="font-medium text-foreground">?</span> is for
                  “not sure”, <span className="font-medium text-foreground">☕</span> for “I need a break”.
                </p>
              </div>
            )}
            {cards.length ? <Deck cards={cards} size="sm" /> : <EmptyDeck size="sm" />}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 z-40 mt-10 border-t bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0 text-sm">
            <div className="truncate font-medium">{form.roomName.trim() || "Untitled game"}</div>
            <div className="text-muted-foreground">
              {selected.label}
              {cards.length > 0 && ` · ${cards.length} cards`}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" className="h-11" onClick={form.cancel}>
              Cancel
            </Button>
            <CreateButton form={form} />
          </div>
        </div>
      </div>
    </main>
  );
}

// --- C: Quick start ------------------------------------------------------------
// One big field and Enter. Below it the cards lie on a table of fixed size, so
// picking a scale or typing custom cards never moves the page: the blurb and
// the hint under the table hold their lines too. Custom cards are typed
// straight onto the table, one card at a time.

const { minCards: MIN_CARDS, maxCards: MAX_CARDS, maxCardLength: MAX_CARD_LENGTH } = SCALE_VALIDATION;

type TableTone = "muted" | "notice" | "error";

/** The table the deck lies on, and the one line under it. */
function CardTable({
  children,
  note,
  tone = "muted",
  count,
  onPointerDown,
}: {
  children: ReactNode;
  note: ReactNode;
  tone?: TableTone;
  count?: string;
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="w-full">
      <div
        onPointerDown={onPointerDown}
        className={cn("flex min-h-[196px] w-full flex-col items-center justify-center gap-4 rounded-2xl border p-4 sm:p-6", BOARD_DOTS)}
      >
        {children}
      </div>
      <div className="mt-2.5 flex h-5 items-center justify-between gap-4 px-1 text-xs">
        <span
          aria-live="polite"
          className={cn(
            "truncate",
            tone === "muted" && "text-muted-foreground",
            tone === "notice" && "text-amber-700 dark:text-amber-400",
            tone === "error" && "text-destructive"
          )}
        >
          {note}
        </span>
        {count && <span className="shrink-0 text-muted-foreground tabular-nums">{count}</span>}
      </div>
    </div>
  );
}

/** A preset's deck, dealt onto the table card by card. */
function PresetDeck({ scale }: { scale: VotingScaleType }) {
  const cards = VOTING_SCALES[scale].cards;
  return (
    <CardTable note={`${cards.length} cards. ? means not sure, ☕ asks for a break.`}>
      <div key={scale} className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
        {cards.map((card, i) => (
          <PlayingCard
            key={card}
            value={card}
            size="table"
            className="fill-mode-backwards hover:-translate-y-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
            style={{ animationDelay: `${i * 18}ms` }}
          />
        ))}
      </div>
    </CardTable>
  );
}

/**
 * Custom cards, typed onto the table. Enter or a comma lays the card down,
 * Backspace on an empty field picks the last one up, a pasted list lays them
 * all. A duplicate isn't added: the card already there flashes instead.
 */
function CustomDeck({ form }: { form: PokerForm }) {
  const cards = cardsOf("custom", form.customCards);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const full = cards.length >= MAX_CARDS;

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [flash]);

  const save = (next: string[]) => form.setCustomCards(next.join(", "));

  const lay = (values: string[]) => {
    const next = [...cards];
    for (const raw of values) {
      const card = raw.trim();
      if (!card) continue;
      if (next.includes(card)) {
        setFlash(card);
        setNotice(`${card} is already on the table.`);
        continue;
      }
      if (next.length >= MAX_CARDS) {
        setNotice(`A deck holds ${MAX_CARDS} cards at most.`);
        break;
      }
      next.push(card.slice(0, MAX_CARD_LENGTH));
    }
    if (next.length !== cards.length) save(next);
  };

  const pickUp = (card: string) => {
    save(cards.filter((c) => c !== card));
    setNotice(null);
    input.current?.focus();
  };

  const onChange = (value: string) => {
    setNotice(null);
    const parts = value.split(",");
    const rest = parts.pop() ?? "";
    if (parts.length) lay(parts);
    if (rest.trim().length > MAX_CARD_LENGTH) setNotice(`A card fits ${MAX_CARD_LENGTH} characters.`);
    setDraft(rest.trimStart().slice(0, MAX_CARD_LENGTH));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (draft.trim()) {
        lay([draft]);
        setDraft("");
      } else if (form.canCreate) {
        form.create();
      }
    } else if (event.key === "Backspace" && !draft && cards.length) {
      event.preventDefault();
      save(cards.slice(0, -1));
      setNotice(null);
    } else if (event.key === "Escape") {
      setDraft("");
    }
  };

  const onBlur = () => {
    if (draft.trim()) lay([draft]);
    setDraft("");
  };

  const startFrom = (scale: VotingScaleType) => {
    save(VOTING_SCALES[scale].cards.slice(0, MAX_CARDS));
    setNotice(null);
    input.current?.focus();
  };

  const [note, tone]: [string, TableTone] = notice
    ? [notice, "notice"]
    : cards.length === 0
      ? ["Type a card and press Enter. A comma works too, so you can paste a list.", "muted"]
      : cards.length < MIN_CARDS
        ? [`Add ${MIN_CARDS - cards.length} more: a deck needs at least ${MIN_CARDS} cards.`, "muted"]
        : form.customError
          ? [form.customError, "error"]
          : ["Backspace picks up the last card. Hover a card to remove it.", "muted"];

  return (
    <CardTable
      note={note}
      tone={tone}
      count={`${cards.length} / ${MAX_CARDS}`}
      // A press on the bare table goes to the field, so you can always just type.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          input.current?.focus();
        }
      }}
    >
      <ul aria-label="Your cards" className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        {cards.map((card) => (
          <li key={card} className="group relative motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:duration-200">
            <PlayingCard
              value={card}
              size="table"
              className={cn(flash === card && "ring-2 ring-amber-400 ring-offset-2 ring-offset-background motion-safe:animate-bounce")}
            />
            <button
              type="button"
              aria-label={`Remove ${card}`}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => pickUp(card)}
              className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-foreground text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <X className="size-3" strokeWidth={3} />
            </button>
          </li>
        ))}
        {!full && (
          <li>
            <input
              ref={input}
              autoFocus
              aria-label="Add a card"
              value={draft}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              placeholder={cards.length ? "Add" : "Type a card"}
              className="h-11 w-24 rounded-lg border-2 border-dashed border-muted-foreground/35 bg-background/70 px-2 text-center text-sm font-bold transition-colors outline-none placeholder:font-medium placeholder:text-muted-foreground/70 focus:border-solid focus:border-primary sm:h-16 sm:w-28 sm:rounded-xl sm:text-lg sm:placeholder:text-sm"
            />
          </li>
        )}
      </ul>
      {cards.length === 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
          or start from
          {(["fibonacci", "standard", "tshirt"] as const).map((scale) => (
            <button
              key={scale}
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => startFrom(scale)}
              className="rounded-full border bg-background/80 px-2.5 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
            >
              {scaleOf(scale).short}
            </button>
          ))}
        </div>
      )}
    </CardTable>
  );
}

function VariantC({ form }: { form: PokerForm }) {
  const selected = scaleOf(form.scale);
  const waitingOnDeck = form.scale === "custom" && !form.canCreate && !form.isCreating;
  return (
    <main className="relative isolate flex-1">
      <GridBackdrop id="proto-poker-c" />
      <div className="mx-auto max-w-4xl px-4 pt-32 pb-28 sm:px-6 sm:pt-36">
        <CeremonyTabs current="poker" variant="C" />
        <h1 className="mt-8 text-center text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          What are you estimating?
        </h1>
        <p className="mt-3 text-center text-muted-foreground">Name the game and press Enter. You can change the rest on the board.</p>

        <div className="mt-10 flex flex-col gap-2 rounded-2xl border bg-card p-2 shadow-xl shadow-black/5 transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-2xl sm:flex-row sm:items-center dark:shadow-black/40">
          <label htmlFor="room-name" className="sr-only">
            Game name
          </label>
          <input
            id="room-name"
            autoFocus
            placeholder="Sprint 42 planning"
            maxLength={ROOM_NAME.maxLength}
            value={form.roomName}
            onChange={(e) => form.setRoomName(e.target.value)}
            onKeyDown={enterCreates(form)}
            className="h-14 min-w-0 flex-1 bg-transparent px-4 text-xl outline-none placeholder:text-muted-foreground/60"
          />
          <CreateButton form={form} label="Start game" className="h-12 px-6 text-base" />
        </div>
        <p className="mt-3 h-4 text-center text-xs text-muted-foreground">
          {waitingOnDeck
            ? "Finish your deck below to start."
            : "No name? It’s named after the time it starts. The invite link is copied for you."}
        </p>

        <section aria-labelledby="cards-heading" className="mt-14 flex flex-col items-center">
          <h2 id="cards-heading" className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Cards
          </h2>
          <div className="mt-3 max-w-full">
            <Segmented
              label="Voting scale"
              options={SCALES.map((s) => ({ value: s.key, label: s.short }))}
              value={form.scale}
              onChange={form.setScale}
            />
          </div>
          <p className="mt-3 h-10 text-center text-sm text-balance text-muted-foreground sm:h-5">{selected.blurb}</p>
          <div className="mt-4 w-full">
            {form.scale === "custom" ? <CustomDeck form={form} /> : <PresetDeck scale={form.scale} />}
          </div>
        </section>
      </div>
    </main>
  );
}

// --- D: Board-first ------------------------------------------------------------
// The page is the board: a dotted canvas showing the game as the team will see
// it, live, with a floating settings panel like the board's own side panel.

const PREVIEW_PLAYERS = ["You", "Alex", "Sam", "Priya"];

function VariantD({ form }: { form: PokerForm }) {
  const cards = cardsOf(form.scale, form.customCards);
  return (
    <main className={cn("relative isolate flex-1", BOARD_DOTS)}>
      <div className="mx-auto grid min-h-[100svh] max-w-7xl gap-8 px-4 pt-28 pb-16 sm:px-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
        <aside className="rounded-2xl border bg-background/95 p-6 shadow-xl backdrop-blur lg:sticky lg:top-28">
          <h1 className="text-xl font-semibold tracking-tight">New planning poker game</h1>
          <p className="mt-1 text-sm text-muted-foreground">The board on the right is what your team will see.</p>

          <div className="mt-6 space-y-2">
            <label htmlFor="room-name" className="text-sm font-medium">
              Game name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <NameInput form={form} autoFocus />
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium">Voting scale</div>
            <div role="radiogroup" aria-label="Voting scale" className="mt-2 divide-y rounded-xl border">
              {SCALES.map((s) => {
                const on = form.scale === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => form.setScale(s.key)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition first:rounded-t-xl last:rounded-b-xl",
                      on ? "bg-muted" : "hover:bg-muted/50"
                    )}
                  >
                    <RadioDot on={on} />
                    <span className="flex-1 font-medium">{s.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {s.key === "custom" ? "…" : sampleOf(s.key, "").slice(0, 4).join(" ")}
                    </span>
                  </button>
                );
              })}
            </div>
            {form.scale === "custom" && (
              <div className="mt-4">
                <CustomScaleField form={form} autoFocus />
              </div>
            )}
          </div>

          <CreateButton form={form} className="mt-6 h-12 w-full text-base" />
          <Button variant="ghost" className="mt-2 h-10 w-full text-muted-foreground" onClick={form.cancel}>
            Cancel
          </Button>
        </aside>

        <section aria-label="Preview" className="flex min-h-[560px] flex-col items-center justify-between gap-10 py-6">
          <span className="rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            Live preview
          </span>
          <div className="rounded-xl border bg-card px-6 py-4 text-center shadow-md">
            <div className={cn("text-lg font-semibold", !form.roomName.trim() && "text-muted-foreground")}>
              {form.roomName.trim() || "Untitled game"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Voting · 1 of {PREVIEW_PLAYERS.length} voted</div>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {PREVIEW_PLAYERS.map((player, i) => (
              <div key={player} className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "h-20 w-14 rounded-xl border-2 shadow-sm",
                    i === 0
                      ? "border-blue-500 bg-blue-500/90 dark:border-blue-400 dark:bg-blue-600"
                      : "border-dashed border-gray-300 bg-white/60 dark:border-border dark:bg-surface-1/60"
                  )}
                />
                <span className="text-xs font-medium">{player}</span>
              </div>
            ))}
          </div>
          <div className="w-full">
            {cards.length ? (
              <Deck cards={cards} size="lg" raise={Math.min(3, cards.length - 1)} className="justify-center gap-3 pt-3" />
            ) : (
              <div className="flex justify-center">
                <EmptyDeck size="lg" />
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

// --- E: Three steps ------------------------------------------------------------
// The form as three columns read left to right, all visible at once (no
// wizard clicks). Each step ticks itself off; the last one starts the game.

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

function VariantE({ form }: { form: PokerForm }) {
  const selected = scaleOf(form.scale);
  const cards = cardsOf(form.scale, form.customCards);
  const scaleDone = form.scale !== "custom" || (cards.length > 0 && !form.customError);
  return (
    <main className="relative isolate flex-1">
      <GridBackdrop id="proto-poker-e" />
      <div className="mx-auto max-w-6xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 sm:pb-24">
        <header className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">New planning poker game</h1>
          <p className="mt-2 text-muted-foreground">Three quick steps. Only the last one is required.</p>
        </header>
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          <Step n={1} title="Name it" hint="Optional" done={!!form.roomName.trim()}>
            <label htmlFor="room-name" className="sr-only">
              Game name
            </label>
            <NameInput form={form} autoFocus />
            <p className="mt-2 text-xs text-muted-foreground">Shown at the top of the board. Leave empty for a timed name.</p>
          </Step>

          <Step n={2} title="Pick the cards" done={scaleDone}>
            <div role="radiogroup" aria-label="Voting scale" className="space-y-2">
              {SCALES.map((s) => {
                const on = form.scale === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => form.setScale(s.key)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                      on ? "border-primary bg-primary/[0.04] ring-1 ring-primary" : "hover:bg-muted/50"
                    )}
                  >
                    <RadioDot on={on} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.label}</span>
                      <span className="block text-xs text-muted-foreground">{s.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {form.scale === "custom" && (
              <div className="mt-4">
                <CustomScaleField form={form} autoFocus />
              </div>
            )}
          </Step>

          <Step n={3} title="Start" done={false} emphasized>
            <div className="rounded-xl bg-muted/50 p-4">
              <div className={cn("truncate font-medium", !form.roomName.trim() && "text-muted-foreground")}>
                {form.roomName.trim() || "Untitled game"}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {selected.label}
                {cards.length > 0 && ` · ${cards.length} cards`}
              </div>
              <div className="mt-3">{cards.length ? <Deck cards={cards} size="xs" className="gap-1" /> : <EmptyDeck size="xs" />}</div>
            </div>
            <CopyLinkNote className="mt-4" />
            <div className="mt-auto pt-6">
              <CreateButton form={form} className="h-12 w-full text-base" />
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

export function PokerPrototype({ variant, form }: { variant: string; form: PokerForm }) {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Navbar />
      {variant === "A" && <VariantA form={form} />}
      {variant === "B" && <VariantB form={form} />}
      {variant === "C" && <VariantC form={form} />}
      {variant === "D" && <VariantD form={form} />}
      {variant === "E" && <VariantE form={form} />}
      <Footer />
      <PrototypeSwitcher variants={POKER_VARIANTS} current={variant} />
    </div>
  );
}
