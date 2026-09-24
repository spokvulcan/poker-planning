"use client";

import { memo, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, ClipboardCopy, Eye, MessagesSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { permissionProps } from "@/hooks/usePermissions";
import { RETRO_STEPS, type RetroStep } from "@/convex/retroTemplates";
import { RETRO_NODE_WIDTH } from "@/convex/retroLayout";
import { plural, stickiesLabel } from "../retro-summary";
import type { RetroNodeData } from "../types";

const STEPS: { step: Exclude<RetroStep, "done">; label: string }[] = [
  { step: "write", label: "Write" },
  { step: "vote", label: "Vote" },
  { step: "discuss", label: "Discuss" },
];

/** The progress bar and its count, as in the poker session node. */
function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="mb-3 flex items-center gap-2">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-blue-200 dark:bg-status-info-bg"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="h-2 bg-blue-500 transition-all duration-300 dark:bg-status-info-fg" style={{ width: `${percent}%` }} />
      </div>
      <span className="font-mono text-xs font-medium whitespace-nowrap text-blue-700 tabular-nums dark:text-status-info-fg">
        {label}
      </span>
    </div>
  );
}

/** The one big button, 48px like the poker room's Reveal. */
function Cta({
  onClick,
  disabled,
  tone = "blue",
  icon,
  children,
  decision,
  label,
}: {
  onClick?: () => void;
  disabled?: boolean;
  tone?: "blue" | "green";
  icon: ReactNode;
  children: ReactNode;
  decision?: RetroNodeData["canFlow"];
  label?: string;
}) {
  const allowed = decision ? decision.allowed : true;
  const off = disabled || !allowed;
  return (
    <button
      type="button"
      onClick={allowed && !disabled ? onClick : undefined}
      disabled={off}
      aria-label={label}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-lg font-medium transition-all",
        off
          ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-surface-2 dark:text-gray-500"
          : tone === "green"
            ? "bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 hover:shadow-md active:bg-emerald-700"
            : "bg-blue-500 text-white shadow-sm hover:bg-blue-600 hover:shadow-md active:bg-blue-700"
      )}
      {...(decision ? permissionProps(decision) : {})}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

/**
 * The retro node: what the Session node is to poker. It names the retro,
 * shows where it is (Write, Vote, Discuss) and carries the one button that
 * moves everyone on. The steps are soft: a facilitator can jump back and
 * nothing written is ever locked.
 */
export const RetroNode = memo(({ data, selected }: NodeProps<Node<RetroNodeData, "retro">>): ReactElement => {
  const {
    name,
    step,
    stickyCount,
    writers,
    participants,
    votesCast,
    votesPerPerson,
    myVotes,
    topicIndex,
    topicCount,
    focusedId,
    focusedLabel,
    nextRoomId,
    openActions,
    totalActions,
    canFlow,
    actions,
  } = data;
  const done = step === "done";
  const lastTopic = topicCount > 0 && topicIndex >= topicCount - 1;

  return (
    <div className="relative" style={{ width: RETRO_NODE_WIDTH }}>
      <Handle type="target" position={Position.Left} id="left" className="bg-gray-400! dark:bg-surface-3!" aria-hidden="true" />
      <Handle type="source" position={Position.Right} id="right" className="bg-gray-400! dark:bg-surface-3!" aria-hidden="true" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="bg-gray-400! dark:bg-surface-3!" aria-hidden="true" />

      <div
        className={cn(
          "rounded-lg border-2 p-4 shadow-lg transition-all",
          done
            ? "border-green-400 bg-gradient-to-br from-green-50 to-emerald-50 dark:border-green-600 dark:from-green-900/20 dark:to-emerald-900/20"
            : "border-blue-400 bg-gradient-to-br from-blue-50 to-indigo-50 dark:border-blue-600 dark:from-blue-900/20 dark:to-indigo-900/20",
          selected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-blue-400 dark:ring-offset-surface-1"
        )}
        role="article"
        aria-label={`Retro: ${name}`}
        data-testid="retro-node"
        data-step={step}
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{name}</h3>
          <div className={cn("size-2 shrink-0 rounded-full", done ? "bg-green-500" : "animate-pulse bg-blue-500")} />
        </div>

        {/* The steps */}
        <nav className="mb-3 flex items-center justify-between rounded-md bg-gray-100/50 p-1 dark:bg-surface-2/50" aria-label="Retro steps">
          {STEPS.map(({ step: s, label }, i) => {
            const state =
              RETRO_STEPS.indexOf(step) > RETRO_STEPS.indexOf(s) ? "past" : step === s ? "current" : "future";
            return (
              <button
                key={s}
                type="button"
                onClick={canFlow.allowed && step !== s ? () => actions.setStep(s) : undefined}
                disabled={!canFlow.allowed || step === s}
                aria-current={state === "current" ? "step" : undefined}
                aria-label={canFlow.allowed && step !== s ? `Go to ${label}` : label}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded px-1.5 py-1 text-xs font-medium transition-colors",
                  state === "current" && "bg-white text-blue-700 shadow-sm dark:bg-surface-1 dark:text-blue-300",
                  state === "past" && "text-emerald-700 dark:text-emerald-400",
                  state === "future" && "text-gray-500 dark:text-gray-400",
                  canFlow.allowed && step !== s && "hover:bg-white/70 dark:hover:bg-surface-3/60",
                  "disabled:cursor-default"
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[10px] font-semibold",
                    state === "current" && "bg-blue-500 text-white",
                    state === "past" && "bg-emerald-500 text-white",
                    state === "future" && "bg-gray-200 text-gray-600 dark:bg-surface-3 dark:text-gray-300"
                  )}
                >
                  {state === "past" ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
                </span>
                {label}
              </button>
            );
          })}
        </nav>

        {/* What this step is for */}
        <p className="mb-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          {step === "write" && "Everyone writes at once. Stickies stay face-down until you reveal them."}
          {step === "vote" &&
            `Drop a sticky on another to stack them. Then vote: ${plural(votesPerPerson, "vote")} each.`}
          {step === "discuss" && "Talk through the top topics. Add action items as you go."}
          {done &&
            (totalActions === 0
              ? "Retro complete. No action items this time."
              : `Retro complete. ${openActions} of ${plural(totalActions, "action item")} open.`)}
        </p>

        {/* The discussion's current topic */}
        {step === "discuss" && (
          <div className="mb-3 flex items-center gap-1">
            <button
              type="button"
              onClick={canFlow.allowed ? () => actions.stepDiscussion("previous") : undefined}
              disabled={!canFlow.allowed || topicIndex <= 0}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/70 disabled:opacity-30 dark:hover:bg-surface-3/60"
              aria-label="Previous topic"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={focusedId ? () => actions.panToTopic(focusedId) : undefined}
              className="min-w-0 flex-1 rounded-md bg-white/70 px-3 py-1.5 text-left transition-colors hover:bg-white dark:bg-surface-2/60 dark:hover:bg-surface-2"
            >
              <span className="block font-mono text-[11px] font-medium text-blue-700 tabular-nums dark:text-status-info-fg">
                {topicCount === 0 ? "No topics" : `Topic ${Math.max(topicIndex + 1, 1)} of ${topicCount}`}
              </span>
              <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                {focusedLabel ?? "Pick a sticky to discuss"}
              </span>
            </button>
            <button
              type="button"
              onClick={canFlow.allowed ? () => actions.stepDiscussion("next") : undefined}
              disabled={!canFlow.allowed || lastTopic}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/70 disabled:opacity-30 dark:hover:bg-surface-3/60"
              aria-label="Next topic"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}

        <div className="border-t border-gray-200 pt-3 dark:border-border">
          {step === "write" && (
            <>
              <Progress
                value={writers}
                max={Math.max(participants, writers)}
                label={`${writers}/${Math.max(participants, writers)} wrote`}
              />
              <Cta
                onClick={() => actions.setStep("vote")}
                disabled={stickyCount === 0}
                icon={<Eye className="size-5" />}
                decision={canFlow}
                label={stickyCount === 0 ? "Waiting for stickies" : "Reveal all stickies"}
              >
                {stickyCount === 0 ? "Waiting for stickies..." : `Reveal ${stickiesLabel(stickyCount)}`}
              </Cta>
            </>
          )}

          {step === "vote" && (
            <>
              <Progress
                value={votesCast}
                max={Math.max(participants * votesPerPerson, votesCast)}
                label={`${votesCast}/${Math.max(participants * votesPerPerson, votesCast)} votes`}
              />
              <div className="mb-3 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>Your votes</span>
                <span className="flex items-center gap-1" aria-label={`${votesPerPerson - myVotes} of ${votesPerPerson} votes left`}>
                  {Array.from({ length: votesPerPerson }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "size-2.5 rounded-full transition-colors",
                        i < myVotes ? "bg-blue-500" : "bg-blue-200 ring-1 ring-blue-500/40 dark:bg-blue-500/15"
                      )}
                    />
                  ))}
                </span>
              </div>
              <Cta onClick={() => actions.setStep("discuss")} icon={<MessagesSquare className="size-5" />} decision={canFlow}>
                Start discussion
              </Cta>
            </>
          )}

          {step === "discuss" && (
            <>
              <Progress
                value={Math.max(topicIndex + 1, 0)}
                max={topicCount}
                label={`${Math.max(topicIndex + 1, 0)}/${topicCount} topics`}
              />
              {lastTopic || topicCount === 0 ? (
                <Cta onClick={() => actions.setStep("done")} tone="green" icon={<Check className="size-5" />} decision={canFlow}>
                  Finish retro
                </Cta>
              ) : (
                <Cta onClick={() => actions.stepDiscussion("next")} icon={<ChevronRight className="size-5" />} decision={canFlow}>
                  Next topic
                </Cta>
              )}
            </>
          )}

          {done && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={actions.copySummary}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-white/70 text-sm font-medium text-gray-800 ring-1 ring-foreground/10 transition-colors hover:bg-white dark:bg-surface-2/60 dark:text-gray-200 dark:hover:bg-surface-2"
              >
                <ClipboardCopy className="size-4" />
                Copy summary
              </button>
              {nextRoomId ? (
                <Link
                  href={`/room/${nextRoomId}`}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 font-medium text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md"
                >
                  Go to the next retro
                  <ArrowRight className="size-5" />
                </Link>
              ) : (
                <Cta onClick={actions.startNext} tone="green" icon={<Sparkles className="size-5" />} decision={canFlow}>
                  Start the next retro
                </Cta>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

RetroNode.displayName = "RetroNode";
