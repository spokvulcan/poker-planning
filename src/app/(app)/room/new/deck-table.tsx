"use client";

/**
 * The cards a new poker room will deal, lying on the create page's stage: a
 * preset's deck, or a custom one typed onto it card by card. The table has
 * room for two full rows, so a deck growing to its limit doesn't move the
 * page.
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { Stage, type StageTone } from "@/components/create/choice-section";
import { SCALE_VALIDATION, VOTING_SCALES, type VotingScaleType } from "@/convex/scales";
import { cn } from "@/lib/utils";

const { minCards, maxCards, maxCardLength } = SCALE_VALIDATION;

const TABLE = "flex min-h-[196px] flex-col items-center justify-center gap-4 p-4 sm:p-6";

/** A card as the board deals it (VotingCardNode's look), at table size. */
function TableCard({ value, className, style }: { value: string; className?: string; style?: CSSProperties }) {
  return (
    <span
      style={style}
      className={cn(
        "inline-flex h-11 min-w-8 shrink-0 items-center justify-center rounded-lg border-2 border-gray-300 bg-white px-1 text-sm font-bold text-gray-900 shadow-md transition-transform duration-200 ease-out sm:h-16 sm:min-w-11 sm:rounded-xl sm:px-1.5 sm:text-lg dark:border-border dark:bg-surface-1 dark:text-gray-100",
        className
      )}
    >
      {value}
    </span>
  );
}

/** A preset's deck, dealt onto the table card by card. */
export function PresetDeck({ scale }: { scale: VotingScaleType }) {
  const cards = VOTING_SCALES[scale].cards;
  return (
    <Stage className={TABLE} note={`${cards.length} cards. ? means not sure, ☕ asks for a break.`}>
      <div key={scale} className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
        {cards.map((card, i) => (
          <TableCard
            key={card}
            value={card}
            className="fill-mode-backwards motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
            style={{ animationDelay: `${i * 18}ms` }}
          />
        ))}
      </div>
    </Stage>
  );
}

/**
 * A custom deck, typed onto the table. Enter or a comma lays the card down,
 * so a pasted list lays them all; Backspace on an empty field picks the last
 * one up. A duplicate isn't laid: the card already there flashes instead.
 * Enter on an empty field starts the room once the deck is ready.
 */
export function CustomDeck({
  cards,
  onChange,
  error,
  autoFocus,
  canStart,
  onStart,
}: {
  cards: string[];
  onChange: (cards: string[]) => void;
  /** Why the deck can't be dealt yet, from the shared validator. */
  error: string | null;
  autoFocus: boolean;
  canStart: boolean;
  onStart: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [flash]);

  const lay = (values: string[]) => {
    const next = [...cards];
    for (const value of values) {
      const card = value.trim().slice(0, maxCardLength);
      if (!card) continue;
      if (next.includes(card)) {
        setFlash(card);
        setNotice(`${card} is already on the table.`);
        continue;
      }
      if (next.length >= maxCards) {
        setNotice(`A deck holds ${maxCards} cards at most.`);
        break;
      }
      next.push(card);
    }
    if (next.length !== cards.length) onChange(next);
  };

  const pickUp = (card: string) => {
    onChange(cards.filter((c) => c !== card));
    setNotice(null);
    input.current?.focus();
  };

  const type = (value: string) => {
    setNotice(null);
    const parts = value.split(",");
    const rest = parts.pop() ?? "";
    if (parts.length) lay(parts);
    if (rest.trim().length > maxCardLength) setNotice(`A card fits ${maxCardLength} characters.`);
    setDraft(rest.trimStart().slice(0, maxCardLength));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (draft.trim()) {
        lay([draft]);
        setDraft("");
      } else if (canStart) {
        onStart();
      }
    } else if (event.key === "Backspace" && !draft && cards.length) {
      event.preventDefault();
      onChange(cards.slice(0, -1));
      setNotice(null);
    } else if (event.key === "Escape") {
      setDraft("");
    }
  };

  // A card left in the field is laid when the field is left, so it isn't lost.
  const onBlur = () => {
    if (draft.trim()) lay([draft]);
    setDraft("");
  };

  const startFrom = (scale: VotingScaleType) => {
    onChange(VOTING_SCALES[scale].cards.slice(0, maxCards));
    setNotice(null);
    input.current?.focus();
  };

  const [note, tone]: [string, StageTone] = notice
    ? [notice, "notice"]
    : cards.length === 0
      ? ["Type a card and press Enter. A comma works too, so you can paste a list.", "muted"]
      : cards.length < minCards
        ? [`Add ${minCards - cards.length} more: a deck needs at least ${minCards} cards.`, "muted"]
        : error
          ? [error, "error"]
          : ["Backspace picks up the last card. Hover a card to remove it.", "muted"];

  return (
    <Stage
      className={TABLE}
      note={note}
      tone={tone}
      count={`${cards.length} / ${maxCards}`}
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
          <li
            key={card}
            className="group relative motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:duration-200"
          >
            <TableCard
              value={card}
              className={cn(flash === card && "-translate-y-1.5 ring-2 ring-status-warning-fg ring-offset-2 ring-offset-background")}
            />
            <button
              type="button"
              aria-label={`Remove ${card}`}
              // Keeps the field focused, so the click doesn't lay a half-typed card first.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => pickUp(card)}
              className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-foreground text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <X className="size-3" strokeWidth={3} />
            </button>
          </li>
        ))}
        {cards.length < maxCards && (
          <li>
            <input
              ref={input}
              autoFocus={autoFocus}
              aria-label="Add a card"
              value={draft}
              onChange={(e) => type(e.target.value)}
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
          {(Object.keys(VOTING_SCALES) as VotingScaleType[]).map((scale) => (
            <button
              key={scale}
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => startFrom(scale)}
              className="rounded-full border bg-background/80 px-2.5 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
            >
              {VOTING_SCALES[scale].label}
            </button>
          ))}
        </div>
      )}
    </Stage>
  );
}
