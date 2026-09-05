"use client";

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  CARD_TEXT_FIELD,
  DELETE_CARD,
  EDITING_CHIP,
  HIDDEN_CARD_LABEL,
  UNSAVED_CHIP,
} from "@/convex/retroCopy";
import { tintClasses } from "./tints";
import { CARD_WIDTH, type BoardCard } from "./cards";
import { useCardDraft } from "./use-card-draft";

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
  onEditText?: (clientId: string, text: string) => Promise<void>;
  onDelete?: (clientId: string) => void;
  /** The editing indicator: the card focused, or none. */
  onEditing?: (clientId: string | undefined) => void;
};

export type CardNode = Node<CardNodeData, "card">;

/**
 * A card on the board (ADR-0011 at the detail level, ADR-0015, spec §10.9):
 * text, tint and author chip, or a tint-only silhouette when the viewer has
 * no text for it. Its data attributes are the canvas contract the tests
 * read; `data-cluster-id` and `data-late` are placeholders until #293 and
 * #295.
 */
export const CardNodeView = memo(function CardNodeView({ data, selected }: NodeProps<CardNode>) {
  const { card, color, authorName, editingBy, editable } = data;
  const tint = tintClasses(color);
  return (
    <div
      data-card-id={card.clientId}
      data-hidden={String(card.hidden)}
      data-cluster-id={card.clusterId ?? ""}
      data-late="false"
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3 text-sm shadow-sm",
        tint.zone,
        "bg-white/90 dark:bg-surface-2/90",
        selected && "ring-2 ring-ring"
      )}
      style={{ width: CARD_WIDTH }}
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
      <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
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
        {editable && data.onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={DELETE_CARD}
            className="nodrag ml-auto"
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
