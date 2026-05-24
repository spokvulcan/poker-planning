"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { Play, RotateCcw, Zap, ChevronRight } from "lucide-react";
import {
  ReactElement,
  memo,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";

import { cn } from "@/lib/utils";
import { COUNTDOWN_DURATION_MS } from "@/convex/constants";
import { permissionProps } from "@/hooks/usePermissions";

import type { SessionNodeType } from "../types";

export const SessionNode = memo(
  ({ data, selected }: NodeProps<SessionNodeType>): ReactElement => {
    const {
      sessionName,
      participantCount,
      voteCount,
      isVotingComplete,
      hasVotes,
      autoCompleteVoting,
      autoRevealCountdownStartedAt,
      currentIssue,
      canRevealCards: canRevealCardsDecision,
      canControlGameFlow: canControlGameFlowDecision,
      canChangeRoomSettings: canChangeRoomSettingsDecision,
      onRevealCards,
      onResetGame,
      onToggleAutoComplete,
      onCancelAutoReveal,
      onOpenIssuesPanel,
    } = data;

    // Resolved decisions in; booleans drive each control's own onClick,
    // className, and non-permission disabled state. The denial copy and the
    // disabled-when-denied state are layered on via permissionProps, spread
    // after each button's own attributes so they compose rather than replace.
    const canRevealCards = canRevealCardsDecision.allowed;
    const canControlGameFlow = canControlGameFlowDecision.allowed;
    const canChangeRoomSettings = canChangeRoomSettingsDecision.allowed;

    const isActive = !isVotingComplete;

    // Cooldown state for reset button
    const [resetCooldown, setResetCooldown] = useState(0);

    useEffect(() => {
      if (resetCooldown > 0) {
        const timer = setTimeout(() => {
          setResetCooldown(resetCooldown - 1);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }, [resetCooldown]);

    // Auto-reveal countdown state
    const countdownDurationSeconds = COUNTDOWN_DURATION_MS / 1000;
    const [countdownSeconds, setCountdownSeconds] = useState<number | null>(
      null,
    );

    useEffect(() => {
      if (!autoRevealCountdownStartedAt) {
        // Reset countdown when no longer active - this is intentional state sync with props
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCountdownSeconds(null);
        return;
      }

      const updateCountdown = () => {
        const elapsed = (Date.now() - autoRevealCountdownStartedAt) / 1000;
        const remaining = Math.max(0, countdownDurationSeconds - elapsed);

        // Just update the display - reveal is handled server-side via scheduler
        setCountdownSeconds(remaining <= 0 ? 0 : Math.ceil(remaining));
      };

      // Update immediately
      updateCountdown();

      // Then update every 100ms for smooth countdown
      const interval = setInterval(updateCountdown, 100);
      return () => clearInterval(interval);
    }, [autoRevealCountdownStartedAt, countdownDurationSeconds]);

    const isCountdownActive = countdownSeconds !== null && countdownSeconds > 0;

    const handleResetClick = useCallback(() => {
      if (resetCooldown === 0 && onResetGame) {
        setResetCooldown(3); // 3 second cooldown
        onResetGame();
      }
    }, [resetCooldown, onResetGame]);

    const nodeClasses = useMemo(
      () =>
        cn(
          "p-4 rounded-lg shadow-lg border-2 transition-all min-w-[280px] max-w-[320px]",
          isActive
            ? "bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-400 dark:border-blue-600"
            : "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-400 dark:border-green-600",
          selected &&
            "ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-surface-1",
        ),
      [isActive, selected],
    );

    return (
      <div className="relative">
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          className="bg-gray-400! dark:bg-surface-3!"
          aria-hidden="true"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className="bg-gray-400! dark:bg-surface-3!"
          aria-hidden="true"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          className="bg-gray-400! dark:bg-surface-3!"
          aria-hidden="true"
        />
        <Handle
          type="source"
          position={Position.Left}
          id="left"
          className="bg-gray-400! dark:bg-surface-3!"
          aria-hidden="true"
        />

        <div
          className={nodeClasses}
          role="article"
          aria-label={`Planning session: ${sessionName}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
              {sessionName || "Planning Session"}
            </h3>
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                isActive ? "bg-blue-500 animate-pulse" : "bg-green-500",
              )}
            />
          </div>

          {/* Current Issue / Quick Vote */}
          <button
            onClick={onOpenIssuesPanel}
            className="w-full mb-3 px-3 py-2 bg-gray-100/50 dark:bg-surface-2/50 rounded-md hover:bg-gray-200/50 dark:hover:bg-surface-3/50 transition-colors flex items-center justify-between gap-2 group"
            aria-label={
              currentIssue
                ? `Current issue: ${currentIssue.title}. Click to open issues panel.`
                : "Quick Vote mode. Click to open issues panel."
            }
          >
            {currentIssue ? (
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {currentIssue.title}
              </span>
            ) : (
              <span className="flex items-center gap-2 text-sm font-medium text-primary">
                <Zap className="h-4 w-4" />
                Quick Vote
              </span>
            )}
            <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 shrink-0 transition-colors" />
          </button>

          {/* Auto-reveal toggle */}
          <button
            onClick={canChangeRoomSettings ? onToggleAutoComplete : undefined}
            disabled={!canChangeRoomSettings}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 mb-3 rounded-md text-xs font-medium transition-colors",
              !canChangeRoomSettings
                ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-surface-1 text-gray-500 dark:text-gray-400"
                : autoCompleteVoting
                  ? "bg-amber-100 dark:bg-status-warning-bg text-amber-700 dark:text-status-warning-fg hover:bg-amber-200 dark:hover:bg-status-warning-bg/80"
                  : "bg-gray-100 dark:bg-surface-1 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-surface-3",
            )}
            aria-label={
              autoCompleteVoting
                ? "Disable auto-reveal when all vote"
                : "Enable auto-reveal when all vote"
            }
            aria-pressed={autoCompleteVoting}
            {...permissionProps(canChangeRoomSettingsDecision)}
          >
            <Zap
              className={cn(
                "h-3.5 w-3.5",
                autoCompleteVoting &&
                  "text-amber-500 dark:text-status-warning-fg",
              )}
            />
            <span>Auto-reveal: {autoCompleteVoting ? "On" : "Off"}</span>
          </button>

          {/* Progress Bar - always visible */}
          <div className="border-t border-gray-200 dark:border-border pt-3">
            <div className="flex items-center gap-2 mb-3">
              <div
                className={cn(
                  "flex-1 rounded-full h-2 overflow-hidden",
                  isVotingComplete
                    ? "bg-green-200 dark:bg-status-success-bg"
                    : "bg-blue-200 dark:bg-status-info-bg",
                )}
                role="progressbar"
                aria-label="Voting progress"
                aria-valuemin={0}
                aria-valuemax={participantCount}
                aria-valuenow={voteCount}
              >
                <div
                  className={cn(
                    "h-2 transition-all duration-300",
                    isVotingComplete
                      ? "bg-green-500 dark:bg-status-success-fg"
                      : "bg-blue-500 dark:bg-status-info-fg",
                  )}
                  style={{
                    width: `${
                      participantCount > 0
                        ? (voteCount / participantCount) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isVotingComplete
                    ? "text-green-700 dark:text-status-success-fg"
                    : "text-blue-700 dark:text-status-info-fg",
                )}
              >
                {voteCount}/{participantCount}
              </span>
            </div>

            {/* Single Unified Action Button - Mobile-friendly 48px touch target */}
            {isVotingComplete ? (
              /* STATE: Voting Complete → New Round */
              <button
                onClick={canControlGameFlow ? handleResetClick : undefined}
                disabled={resetCooldown > 0 || !canControlGameFlow}
                className={cn(
                  "w-full h-12 flex items-center justify-center gap-2 rounded-lg font-medium transition-all",
                  !canControlGameFlow || resetCooldown > 0
                    ? "bg-gray-100 dark:bg-surface-2 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    : "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white shadow-sm hover:shadow-md",
                )}
                aria-label={
                  resetCooldown > 0
                    ? `Please wait ${resetCooldown} seconds`
                    : "Start a new voting round"
                }
                {...permissionProps(canControlGameFlowDecision)}
              >
                <RotateCcw
                  className={cn("h-5 w-5", resetCooldown > 0 && "animate-spin")}
                />
                <span>
                  {resetCooldown > 0
                    ? `Wait ${resetCooldown}s...`
                    : "New Round"}
                </span>
              </button>
            ) : isCountdownActive ? (
              /* STATE: Countdown Active → Cancel */
              <button
                onClick={canRevealCards ? onCancelAutoReveal : undefined}
                disabled={!canRevealCards}
                className={cn(
                  "w-full h-12 flex items-center justify-center gap-3 rounded-lg font-medium transition-all",
                  canRevealCards
                    ? "bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-sm hover:shadow-md animate-pulse"
                    : "bg-gray-100 dark:bg-surface-2 text-gray-400 dark:text-gray-500 cursor-not-allowed",
                )}
                aria-label={`Auto-revealing in ${countdownSeconds} seconds. Tap to cancel.`}
                {...permissionProps(canRevealCardsDecision)}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold tabular-nums">
                    {countdownSeconds}s
                  </span>
                  <span className="text-amber-100">·</span>
                  <span>Tap to Cancel</span>
                </span>
              </button>
            ) : (
              /* STATE: Voting In Progress → Reveal */
              <button
                onClick={canRevealCards ? onRevealCards : undefined}
                disabled={!hasVotes || !canRevealCards}
                className={cn(
                  "w-full h-12 flex items-center justify-center gap-2 rounded-lg font-medium transition-all",
                  !canRevealCards || !hasVotes
                    ? "bg-gray-100 dark:bg-surface-2 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white shadow-sm hover:shadow-md",
                )}
                aria-label={
                  hasVotes ? "Reveal all votes" : "Waiting for votes to reveal"
                }
                {...permissionProps(canRevealCardsDecision)}
              >
                <Play className="h-5 w-5" />
                <span>
                  {!canRevealCards
                    ? "Reveal Votes"
                    : hasVotes
                      ? "Reveal Votes"
                      : "Waiting for Votes..."}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
);

SessionNode.displayName = "SessionNode";
