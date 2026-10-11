"use client";

/**
 * The cards a new poker room will deal, lying on the create page's stage: a
 * preset's deck, or a custom one typed onto it card by card. The table has
 * room for two full rows, so a deck growing to its limit doesn't move the
 * page. What a pick deals and whether it can be dealt are the deck's to say
 * (`checkPick`, convex/scales): the table shows its answer, and lays each
 * typed card by asking it.
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { Stage, type StageTone } from "@/components/create/choice-section";
import { cutTo } from "@/convex/fieldRule";
import { CUSTOM_DECK, VOTING_SCALES, checkPick, type CheckedPick, type VotingScaleType } from "@/convex/scales";
import { cn } from "@/lib/utils";

const { maxCards, card: cardRule } = CUSTOM_DECK;

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

/** A preset's deck, the cards its pick deals, dealt onto the table card by card. */
export function PresetDeck({ cards }: { cards: readonly string[] }) {
  return (
    <Stage className={TABLE} note={`${cards.length} cards. ? means not sure, ☕ asks for a break.`}>
      {/* Keyed by its cards, so another preset is dealt afresh under the same note. */}
      <div key={cards.join(" ")} className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
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
 * one up. The table keeps no rule of its own: it lays a card by asking the
 * deck what the table would be with it, laying it as the deck keeps it while
 * the deck is fine or only short of cards, and otherwise saying why in the
 * deck's words (the card already there flashes). The field takes no more
 * than a card holds, as an input's maxLength would. Enter on an empty field
 * starts the room once the deck is ready.
 */
export function CustomDeck({
  deck,
  onChange,
  autoFocus,
  canStart,
  onStart,
}: {
  /** The deck's reading of the cards on the table (`checkPick`): the cards it deals, and any rule it breaks. */
  deck: CheckedPick;
  /** Takes the table's new cards, each as the deck keeps it. */
  onChange: (cards: string[]) => void;
  autoFocus: boolean;
  canStart: boolean;
  onStart: () => void;
}) {
  const { cards } = deck;
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
    let next = cards;
    for (const value of values) {
      // Nothing typed between two commas lays nothing.
      if (!value.trim()) continue;
      const tried = checkPick({ type: "custom", cards: [...next, value] });
      // A deck only short of cards is still being dealt.
      if (tried.ok || tried.rule === "tooFew") {
        next = tried.cards;
        continue;
      }
      setNotice(tried.message);
      if (tried.rule === "duplicate") setFlash(tried.card);
      if (tried.rule === "tooMany") break;
    }
    if (next !== cards) onChange([...next]);
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
    // The field takes no more than a card holds, and says so in the card's
    // rule; a blank one just isn't typed yet.
    const card = cardRule.check(rest);
    if (!card.ok && rest.trim()) setNotice(card.message);
    setDraft(cutTo(rest.trimStart(), cardRule.maxLength));
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
      : !deck.ok
        ? // A deck only short of cards is still being dealt, not wrong.
          [deck.message, deck.rule === "tooFew" ? "muted" : "error"]
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
