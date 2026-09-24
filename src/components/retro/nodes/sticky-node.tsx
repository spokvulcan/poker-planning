"use client";

import { memo, useEffect, useRef, useState, type ReactElement, type KeyboardEvent, type FocusEvent } from "react";
import type { NodeProps } from "@xyflow/react";
import { ArrowUpRight, Check, EyeOff, ImagePlus, Layers, Pencil, Target, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_STICKY_TEXT_LENGTH } from "@/convex/retroTemplates";
import type { Gif, StickyView } from "@/convex/model/retro";
import type { StickyColor } from "@/convex/retroTemplates";
import { FACE_DOWN_HEIGHT, STICKY_WIDTH, STICKY_MIN_HEIGHT } from "@/convex/retroLayout";
import { GifPicker } from "../gif-picker";
import { STICKY_TONES, type StickyTone } from "../sticky-colors";
import type { StickyFlowNode } from "../types";

/** A cheap, stable number from a string: the face-down scribbles' widths. */
function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const SCRIBBLES = [
  ["92%", "78%", "55%"],
  ["85%", "90%", "40%"],
  ["70%", "95%", "62%"],
  ["88%", "60%"],
  ["95%", "82%", "74%", "38%"],
];

function GifImage({ gif, className }: { gif: Gif; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote GIFs from an allowlisted host
    <img
      src={gif.url}
      alt={gif.title ?? "GIF"}
      draggable={false}
      loading="lazy"
      className={cn("block w-full rounded-md bg-black/5 object-cover dark:bg-white/5", className)}
      style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
    />
  );
}

/** The editor a sticky turns into while someone writes on it. */
function StickyEditor({
  initialText,
  initialGif,
  tone,
  onCommit,
  onCancel,
}: {
  initialText: string;
  initialGif?: Gif;
  tone: StickyTone;
  onCommit: (text: string, gif: Gif | undefined) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [gif, setGif] = useState<Gif | undefined>(initialGif);
  const [pickerOpen, setPickerOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  // The node is drawn from its first frame (it has an initial size), so the
  // editor can take focus as it mounts.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    if (!text.trim() && !gif) onCancel();
    else onCommit(text, gif);
  };

  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  // Clicking away sticks it; moving into the GIF picker or the sticky's own
  // buttons does not.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as HTMLElement | null;
    if (pickerOpen || (next && (e.currentTarget.contains(next) || next.closest("[data-gif-picker]")))) return;
    commit();
  };

  return (
    <div className="nodrag nopan flex flex-col gap-2" onBlur={onBlur}>
      {gif && (
        <div className="relative">
          <GifImage gif={gif} />
          <button
            type="button"
            onClick={() => setGif(undefined)}
            className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white transition-colors hover:bg-black/80"
            aria-label="Remove GIF"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <textarea
        ref={textRef}
        value={text}
        maxLength={MAX_STICKY_TEXT_LENGTH}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder={gif ? "Add a caption, or just press Enter" : "What's on your mind?"}
        aria-label="Sticky text"
        className={cn(
          "nowheel field-sizing-content min-h-16 w-full resize-none bg-transparent text-sm leading-snug font-medium outline-none",
          "placeholder:font-normal placeholder:opacity-60",
          tone.ink
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className={cn(
                  "flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors",
                  tone.muted,
                  tone.hover
                )}
                aria-label="Add a GIF"
              >
                <ImagePlus className="size-3.5" />
                GIF
              </button>
            }
          />
          <PopoverContent className="w-80" side="right" align="start">
            <GifPicker
              onPick={(picked) => {
                setGif(picked);
                setPickerOpen(false);
                textRef.current?.focus();
              }}
            />
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-1">
          <span className={cn("hidden text-[10px] sm:inline", tone.muted)}>Enter to stick</span>
          <button
            type="button"
            onClick={commit}
            className="flex size-7 items-center justify-center rounded-md bg-gray-900 text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            aria-label="Stick it"
          >
            <Check className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The face of a sticky nobody but its author may read yet. The sticky is
 * drawn at FACE_DOWN_HEIGHT, so the scribbles fit it and never stretch it.
 */
function FaceDown({ seed, tone }: { seed: string; tone: StickyTone }) {
  const lines = SCRIBBLES[hash(seed) % SCRIBBLES.length];
  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-hidden" aria-hidden="true">
      {lines.map((width, i) => (
        <span key={i} className={cn("h-2.5 rounded-full", tone.scribble)} style={{ width }} />
      ))}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  destructive,
}: {
  label: string;
  onClick: () => void;
  children: ReactElement;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-surface-3 dark:hover:text-white",
              destructive && "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            )}
            aria-label={label}
          >
            {children}
          </button>
        }
      />
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** One sticky from a stack, listed under its top when the stack is open. */
function StackMember({
  member,
  tone,
  otherColor,
  canUnstack,
  onUnstack,
}: {
  member: StickyView;
  tone: StickyTone;
  /** The member's own column colour, when it differs from the stack's. */
  otherColor?: StickyColor;
  canUnstack: boolean;
  onUnstack: () => void;
}) {
  return (
    <li className={cn("flex items-start gap-2 border-t border-dashed pt-2", "border-current/15")}>
      {otherColor && (
        <span
          className={cn("mt-1 size-2 shrink-0 rounded-full", STICKY_TONES[otherColor].swatch)}
          aria-hidden="true"
        />
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        {member.gif && <GifImage gif={member.gif} className="max-h-24 object-cover" />}
        {member.text && <p className="text-xs leading-snug font-medium break-words whitespace-pre-wrap">{member.text}</p>}
      </div>
      {canUnstack && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnstack();
          }}
          className={cn("nodrag shrink-0 rounded p-1 transition-colors", tone.muted, tone.hover)}
          aria-label="Take off the stack"
          title="Take off the stack"
        >
          <ArrowUpRight className="size-3.5" />
        </button>
      )}
    </li>
  );
}

/**
 * A sticky on the retro whiteboard. Face-down (scribbles) for everyone but
 * its author until the reveal, like a poker card; drop one on another to
 * stack them; vote with a dot while the retro is in Vote; in Discuss the
 * topic under discussion lifts into the spotlight.
 */
export const StickyNode = memo(({ data, selected, dragging }: NodeProps<StickyFlowNode>): ReactElement => {
  const {
    sticky,
    draft,
    color,
    step,
    editing,
    canEdit,
    members,
    columnColors,
    expanded,
    votesLeft,
    rank,
    focused,
    discussed,
    dimmed,
    dropTarget,
    canFocus,
    actions,
  } = data;
  const tone = STICKY_TONES[color];
  const hidden = sticky?.hidden ?? false;

  // The reveal: a sticky that was face-down develops into its text.
  const wasHidden = useRef(hidden);
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    if (wasHidden.current && !hidden) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-shot animation flag on a prop transition
      setRevealing(true);
      const timer = setTimeout(() => setRevealing(false), 900);
      wasHidden.current = hidden;
      return () => clearTimeout(timer);
    }
    wasHidden.current = hidden;
  }, [hidden]);

  // Only a topic (a loose sticky or a stack's top) is a node of its own.
  const showFocus = canFocus && !!sticky && !hidden && !focused && step !== "write";
  const stackDepth = Math.min(members.length, 2);
  const inEditor = editing || !!draft;
  // Face-down, it is one size whatever it holds, or its size would tell.
  const faceSize =
    hidden && !inEditor
      ? { width: STICKY_WIDTH, height: FACE_DOWN_HEIGHT }
      : { width: STICKY_WIDTH, minHeight: STICKY_MIN_HEIGHT };

  const face = (
    <div
      className={cn(
        "relative flex flex-col rounded-lg border-2 p-3 transition-[transform,box-shadow,opacity] duration-200 ease-out",
        tone.paper,
        tone.ink,
        dragging ? "shadow-xl" : "shadow-md",
        !inEditor && !dragging && "hover:shadow-lg",
        focused && "-translate-y-2 shadow-xl ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-blue-400 dark:ring-offset-surface-1",
        selected && !focused && "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-blue-400 dark:ring-offset-surface-1",
        dropTarget && "outline-2 outline-offset-4 outline-blue-500 outline-dashed",
        revealing && "animate-sticky-reveal"
      )}
      style={faceSize}
    >
      {inEditor ? (
        <StickyEditor
          initialText={sticky?.text ?? ""}
          initialGif={sticky?.gif}
          tone={tone}
          onCommit={(text, gif) =>
            draft ? actions.commitDraft(draft.clientId, text, gif) : sticky && actions.commitEdit(sticky._id, text, gif ?? null)
          }
          onCancel={() => (draft ? actions.cancelDraft(draft.clientId) : actions.cancelEdit())}
        />
      ) : hidden ? (
        <FaceDown seed={sticky?.clientId ?? ""} tone={tone} />
      ) : (
        <div
          className="flex flex-1 flex-col gap-2"
          onDoubleClick={canEdit && sticky ? () => actions.startEdit(sticky._id) : undefined}
        >
          {sticky?.gif && <GifImage gif={sticky.gif} />}
          {sticky?.text && (
            <p className="text-sm leading-snug font-medium break-words whitespace-pre-wrap">{sticky.text}</p>
          )}
          {expanded && members.length > 0 && (
            <ul className="space-y-2">
              {members.map((member) => (
                <StackMember
                  key={member._id}
                  member={member}
                  tone={tone}
                  otherColor={columnColors[member.columnId] !== color ? columnColors[member.columnId] : undefined}
                  canUnstack={step !== "write"}
                  onUnstack={() => actions.unstack(member._id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Footer: who, the stack, the votes */}
      {!inEditor && sticky && (
        <div className="mt-auto flex min-h-6 items-center gap-2 pt-2">
          <span className={cn("flex min-w-0 items-center gap-1 truncate text-[11px] font-medium", tone.muted)}>
            {hidden ? null : step === "write" && sticky.mine ? (
              <>
                <EyeOff className="size-3 shrink-0" />
                Only you, until the reveal
              </>
            ) : (
              (sticky.authorName ?? (sticky.mine ? "You" : null))
            )}
          </span>
          {members.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                actions.toggleExpanded(sticky._id);
              }}
              className={cn("nodrag flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", tone.hover, tone.muted)}
              aria-expanded={expanded}
              aria-label={expanded ? "Close the stack" : `Open the stack of ${members.length + 1}`}
            >
              <Layers className="size-3" />
              {members.length + 1}
            </button>
          )}
          <span className="ml-auto" />
          {step === "vote" && (
            <VoteButton
              voted={!!sticky.myVote}
              disabled={!sticky.myVote && votesLeft <= 0}
              onClick={() => actions.toggleVote(sticky._id)}
            />
          )}
          {(step === "discuss" || step === "done") && (sticky.votes ?? 0) > 0 && (
            <span
              className="flex h-6 items-center gap-1 rounded-full bg-blue-500 px-2 font-mono text-xs font-semibold text-white tabular-nums dark:bg-blue-600"
              aria-label={`${sticky.votes} votes`}
            >
              <span className="size-1.5 rounded-full bg-white" />
              {sticky.votes}
            </span>
          )}
        </div>
      )}

      {/* A vote is a dot sticker on the corner */}
      {sticky?.myVote && step === "vote" && (
        <span
          className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-blue-500 shadow-sm ring-2 ring-white dark:ring-surface-1"
          aria-hidden="true"
        />
      )}

      {/* The discussion's order and where it is */}
      {rank !== undefined && (
        <span
          className={cn(
            "absolute -top-3 left-3 flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold shadow-sm",
            focused
              ? "bg-blue-500 text-white dark:bg-blue-600"
              : "bg-white text-gray-700 ring-1 ring-foreground/10 dark:bg-surface-2 dark:text-gray-200"
          )}
        >
          {discussed && !focused && <Check className="size-3 text-emerald-600 dark:text-emerald-400" />}
          {focused ? `Discussing · #${rank}` : `#${rank}`}
        </span>
      )}

      {dropTarget && (
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-sm">
          Drop to stack
        </span>
      )}

      {/* Hover tools */}
      {!inEditor && sticky && !dragging && (showFocus || canEdit) && (
        <div
          className={cn(
            "nodrag absolute -top-4 right-2 flex items-center gap-0.5 rounded-lg bg-white p-0.5 opacity-0 shadow-md ring-1 ring-foreground/10 transition-opacity group-hover/sticky:opacity-100 group-focus-within/sticky:opacity-100 dark:bg-surface-2",
            // On a touch screen there is no hover: a tap selects, and shows them.
            selected && "opacity-100"
          )}
        >
          {showFocus && (
            <IconButton label="Discuss this now" onClick={() => actions.focusTopic(sticky._id)}>
              <Target className="size-3.5" />
            </IconButton>
          )}
          {canEdit && (
            <IconButton label="Edit" onClick={() => actions.startEdit(sticky._id)}>
              <Pencil className="size-3.5" />
            </IconButton>
          )}
          {canEdit && (
            <IconButton label="Delete" destructive onClick={() => actions.deleteSticky(sticky._id)}>
              <Trash2 className="size-3.5" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "group/sticky relative transition-opacity duration-300",
        dimmed && "opacity-50 hover:opacity-100"
      )}
      data-testid="retro-sticky"
      data-hidden={hidden || undefined}
      data-mine={sticky?.mine || undefined}
      data-focused={focused || undefined}
      role="article"
      aria-label={
        draft
          ? "New sticky"
          : hidden
            ? "A sticky, face-down until the reveal"
            : `Sticky: ${sticky?.text || sticky?.gif?.title || "GIF"}`
      }
    >
      {/* The rest of a stack peeks out from under its top */}
      {Array.from({ length: stackDepth }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={cn("absolute inset-0 rounded-lg border-2 shadow-sm", tone.paper)}
          style={{ transform: `translate(${(stackDepth - i) * 5}px, ${(stackDepth - i) * 5}px)` }}
        />
      ))}
      {face}
    </div>
  );
});

StickyNode.displayName = "StickyNode";

function VoteButton({ voted, disabled, onClick }: { voted: boolean; disabled: boolean; onClick: () => void }) {
  const button = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      aria-pressed={voted}
      aria-disabled={disabled}
      className={cn(
        "nodrag flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-all duration-200 active:scale-95",
        voted
          ? "bg-blue-500 text-white shadow-sm hover:bg-blue-600 dark:bg-blue-600"
          : "bg-white/80 text-gray-800 ring-1 ring-black/10 hover:bg-white dark:bg-black/30 dark:text-gray-100 dark:ring-white/15 dark:hover:bg-black/40",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span className={cn("size-2 rounded-full", voted ? "bg-white" : "bg-blue-500")} />
      {voted ? "Voted" : "Vote"}
    </button>
  );
  if (!disabled) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>
        <p>No votes left. Take one back to vote here.</p>
      </TooltipContent>
    </Tooltip>
  );
}
