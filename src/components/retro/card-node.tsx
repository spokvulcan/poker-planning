"use client";

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { ArrowUpToLine, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  CARD_TEXT_FIELD,
  DELETE_CARD,
  EDITING_CHIP,
  HIDDEN_CARD_LABEL,
  LATE_CARD_MARKER,
  RAISE_TOPIC,
  UNSAVED_CHIP,
} from "@/convex/retroCopy";
import type { ResolvedDecision } from "@/convex/permissions";
import { permissionProps } from "@/hooks/usePermissions";
import { tintClasses } from "./tints";
import type { BoardCard } from "./cards";
import { useCardDraft } from "./use-card-draft";
import { cardSizeAt, headlineOf, type ZoomLevel } from "./zoom";
import { DotControls, type DotControlsProps } from "./dot-controls";

// A type alias: React Flow node data must satisfy Record<string, unknown>.
export type CardNodeData = {
  card: BoardCard;
  /** The prompt's tint. */
  color: string;
  /** The author's current display name in a named retro; "Former member" when gone. */
  authorName?: string;
  /** Who else is typing into this card, by name. */
  editingBy?: string;
  /** Own card, or another's under `cardManagement`. */
  editable: boolean;
  /** The semantic zoom level (spec §10.2); detail when absent. */
  level?: ZoomLevel;
  /** In the tap-selection (spec §10.4), which the board keeps out of React Flow's own. */
  tapSelected?: boolean;
  /** The card's dots while the tally is mounted (spec §11); a grouped card's own dots only. */
  dots?: DotControlsProps;
  onEditText?: (clientId: string, text: string) => Promise<void>;
  onDelete?: (clientId: string) => void;
  /** Raise this loose card into the walk (spec §12.2), offered while it is outside one; `stageFlow`, disabled with the copy otherwise. */
  raise?: { decision: ResolvedDecision; onRaise: (clientId: string) => void };
  /** The editing indicator: the card focused, or none. */
  onEditing?: (clientId: string | undefined) => void;
};

export type CardNode = Node<CardNodeData, "card">;

/**
 * A card on the board (ADR-0011, ADR-0015, spec §10.2, §10.9): at detail
 * the text, tint and author chip; at headline the clamped first line and
 * tint; at shape a tinted block. A silhouette — a card the viewer has no
 * text for — is a tint-only block at every level. The size is a function
 * of the level and never stored. Its data attributes are the canvas
 * contract the tests read. A late card (spec §12.3) carries the "New"
 * marker at every level: a chip at detail and headline, a dot at shape.
 */
export const CardNodeView = memo(function CardNodeView({ data, selected: flowSelected }: NodeProps<CardNode>) {
  const { card, color, authorName, editingBy, editable, level = "detail", dots } = data;
  const selected = flowSelected || data.tapSelected === true;
  const tint = tintClasses(color);
  const size = cardSizeAt(level);
  const attributes = {
    "data-card-id": card.clientId,
    "data-hidden": String(card.hidden),
    "data-cluster-id": card.clusterId ?? "",
    "data-late": String(card.late),
    "data-level": level,
    "data-selected": String(selected),
  };
  const lateDot = card.late && (
    <span
      data-testid="late-marker"
      aria-label={LATE_CARD_MARKER}
      className="absolute -top-1.5 -right-1.5 size-3.5 rounded-full border-2 border-white bg-blue-500 dark:border-surface-1 dark:bg-status-info-fg"
    />
  );
  const lateChip = card.late && (
    <span
      data-testid="late-marker"
      className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 uppercase dark:bg-status-info-bg dark:text-status-info-fg"
    >
      {LATE_CARD_MARKER}
    </span>
  );
  if (level === "shape" || (card.hidden && level !== "detail")) {
    return (
      <div
        {...attributes}
        role="img"
        aria-label={card.hidden ? HIDDEN_CARD_LABEL : headlineOf(card.text ?? "")}
        className={cn("relative rounded-xl border shadow-sm", tint.zone, card.hidden && "opacity-60", selected && "ring-2 ring-ring")}
        style={{ width: size.width, height: size.height }}
      >
        {lateDot}
      </div>
    );
  }
  if (level === "headline") {
    return (
      <div
        {...attributes}
        className={cn(
          "flex items-center rounded-xl border px-3 text-base font-medium shadow-sm",
          tint.zone,
          "bg-white/90 dark:bg-surface-2/90",
          selected && "ring-2 ring-ring"
        )}
        style={{ width: size.width, height: size.height }}
      >
        <p className="truncate">{headlineOf(card.text ?? "")}</p>
        {lateChip && <span className="ml-auto shrink-0">{lateChip}</span>}
        {dots && <DotControls count={dots.count} mine={dots.mine} className={cn("shrink-0", !lateChip && "ml-auto")} />}
      </div>
    );
  }
  return (
    <div
      {...attributes}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3 text-sm shadow-sm",
        tint.zone,
        "bg-white/90 dark:bg-surface-2/90",
        selected && "ring-2 ring-ring"
      )}
      style={{ width: size.width }}
    >
      {card.hidden ? (
        <div
          role="img"
          aria-label={HIDDEN_CARD_LABEL}
          className={cn("h-14 rounded-md opacity-60", tint.zone)}
        />
      ) : editable && data.onEditText ? (
        <CardEditor
          clientId={card.clientId}
          text={card.text ?? ""}
          onSave={data.onEditText}
          onEditing={data.onEditing}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words">{card.text}</p>
      )}
      {dots && <DotControls {...dots} />}
      <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
        {lateChip}
        {authorName && (
          <span data-testid="author-chip" className={cn("truncate font-medium", tint.label)}>
            {authorName}
          </span>
        )}
        {editingBy && (
          <span data-testid="editing-chip" className="truncate italic">
            {EDITING_CHIP} · {editingBy}
          </span>
        )}
        {data.raise && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="nodrag ml-auto"
            onClick={() => data.raise?.onRaise(card.clientId)}
            {...permissionProps(data.raise.decision)}
          >
            <ArrowUpToLine className="size-3.5" />
            {RAISE_TOPIC}
          </Button>
        )}
        {editable && data.onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={DELETE_CARD}
            className={cn("nodrag", !data.raise && "ml-auto")}
            onClick={() => data.onDelete?.(card.clientId)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
});

interface CardEditorProps {
  clientId: string;
  text: string;
  onSave: (clientId: string, text: string) => Promise<void>;
  onEditing?: (clientId: string | undefined) => void;
}

/** The editable text: the draft hook owns the debounce, the flush and the "Unsaved" state. */
function CardEditor({ clientId, text, onSave, onEditing }: CardEditorProps) {
  const draft = useCardDraft({ serverText: text, onSave: (value) => onSave(clientId, value) });
  return (
    <div className="flex flex-col gap-1">
      <Textarea
        aria-label={CARD_TEXT_FIELD}
        value={draft.text}
        onChange={(e) => draft.onChange(e.target.value)}
        onFocus={() => {
          draft.onFocus();
          onEditing?.(clientId);
        }}
        onBlur={() => {
          draft.onBlur();
          onEditing?.(undefined);
        }}
        rows={3}
        className="nodrag nowheel min-h-0 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
      />
      {draft.unsaved && (
        <span
          data-testid="unsaved-chip"
          className="self-start rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-status-warning-bg dark:text-status-warning-fg"
        >
          {UNSAVED_CHIP}
        </span>
      )}
    </div>
  );
}
