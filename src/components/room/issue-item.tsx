"use client";

import { FC, useState, useRef, useEffect } from "react";
import { MoreHorizontal, Trash2, Pencil, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { type ResolvedDecision, RESOLVED_ALLOWED } from "@/convex/permissions";
import { useIsDemoMode } from "./demo/DemoSimulationProvider";

interface IssueLink {
  _id: string;
  provider: string;
  externalId: string;
  externalUrl: string;
}

interface IssueItemProps {
  issue: Doc<"issues">;
  isCurrent: boolean;
  onStartVoting: (issueId: Id<"issues">) => void;
  onUpdateTitle: (issueId: Id<"issues">, title: string) => void;
  onUpdateEstimate: (issueId: Id<"issues">, estimate: string) => void;
  onDelete: (issueId: Id<"issues">) => void;
  canManageIssues?: ResolvedDecision;
  canControlGameFlow?: ResolvedDecision;
  issueLink?: IssueLink;
}

export const IssueItem: FC<IssueItemProps> = ({
  issue,
  isCurrent,
  onStartVoting,
  onUpdateTitle,
  onUpdateEstimate,
  onDelete,
  canManageIssues: canManageIssuesDecision = RESOLVED_ALLOWED,
  canControlGameFlow: canControlGameFlowDecision = RESOLVED_ALLOWED,
  issueLink,
}) => {
  const isDemoMode = useIsDemoMode();
  // Resolved decisions in, booleans out for the existing gating logic; the
  // denial copy comes from the resolved decision's message (single source).
  const canManageIssues = canManageIssuesDecision.allowed;
  const canControlGameFlow = canControlGameFlowDecision.allowed;
  const manageIssuesDenial = canManageIssuesDecision.allowed
    ? undefined
    : canManageIssuesDecision.message;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingEstimate, setIsEditingEstimate] = useState(false);
  const [editedTitle, setEditedTitle] = useState(issue.title);
  const [editedEstimate, setEditedEstimate] = useState(
    issue.finalEstimate ?? ""
  );
  const titleInputRef = useRef<HTMLInputElement>(null);
  const estimateInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingEstimate && estimateInputRef.current) {
      estimateInputRef.current.focus();
      estimateInputRef.current.select();
    }
  }, [isEditingEstimate]);

  const handleTitleSave = () => {
    if (editedTitle.trim() && editedTitle !== issue.title) {
      onUpdateTitle(issue._id, editedTitle.trim());
    } else {
      setEditedTitle(issue.title);
    }
    setIsEditingTitle(false);
  };

  const handleEstimateSave = () => {
    if (editedEstimate !== (issue.finalEstimate ?? "")) {
      onUpdateEstimate(issue._id, editedEstimate);
    }
    setIsEditingEstimate(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleSave();
    } else if (e.key === "Escape") {
      setEditedTitle(issue.title);
      setIsEditingTitle(false);
    }
  };

  const handleEstimateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleEstimateSave();
    } else if (e.key === "Escape") {
      setEditedEstimate(issue.finalEstimate ?? "");
      setIsEditingEstimate(false);
    }
  };

  const isVoting = issue.status === "voting";

  const canStartVote = !isVoting && !isDemoMode && canControlGameFlow;
  const titleTooltip = canStartVote
    ? `Click to vote on: ${issue.title}`
    : issue.title;

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3.5 rounded-xl transition-all group border",
        isCurrent 
          ? "bg-blue-50/30 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50 ring-1 ring-blue-400 dark:ring-blue-500 shadow-sm" 
          : "bg-white dark:bg-surface-2 border-gray-200/50 dark:border-border hover:shadow-md hover:border-gray-300/50 dark:hover:border-border/80 shadow-sm"
      )}
    >
      {/* Title */}
      <div className="flex-1 min-w-0 pr-4">
        {isEditingTitle ? (
          <Input
            ref={titleInputRef}
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleTitleKeyDown}
            className="h-8 text-sm bg-white dark:bg-surface-1"
          />
        ) : (
          <div className="flex items-center gap-2">
            {canStartVote ? (
              <button
                type="button"
                className={cn(
                  "text-sm font-medium truncate block transition-colors text-left",
                  isCurrent ? "text-blue-900 dark:text-blue-100" : "text-gray-900 dark:text-gray-100",
                  "cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                )}
                onClick={() => onStartVoting(issue._id)}
                title={titleTooltip}
              >
                {issue.title}
              </button>
            ) : (
              <span
                className={cn(
                  "text-sm font-medium truncate block transition-colors",
                  isCurrent ? "text-blue-900 dark:text-blue-100" : "text-gray-900 dark:text-gray-100",
                )}
                title={titleTooltip}
              >
                {issue.title}
              </span>
            )}
            {issueLink && (
              <a
                href={issueLink.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-1 rounded-md transition-colors"
                title={`View ${issueLink.externalId} in Jira`}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Actions and Final Estimate Container */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Actions Menu (hidden in demo mode) */}
        {!isDemoMode &&
          (canManageIssues ? (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity",
                    isCurrent ? "hover:bg-blue-100/50 dark:hover:bg-blue-800/30 text-blue-600/70" : "hover:bg-gray-100 dark:hover:bg-surface-3 text-gray-400"
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Issue actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setIsEditingTitle(true)}>
                  <Pencil className="h-4 w-4 mr-2 text-gray-500" />
                  Edit title
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(issue._id)}
                  className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/30"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={true}
              className="opacity-40 cursor-not-allowed text-gray-400"
              title={manageIssuesDenial}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Issue actions unavailable</span>
            </Button>
          ))}

        {/* Final Estimate */}
        <div className="w-10 flex justify-end">
          {isEditingEstimate ? (
            <Input
              ref={estimateInputRef}
              value={editedEstimate}
              onChange={(e) => setEditedEstimate(e.target.value)}
              onBlur={handleEstimateSave}
              onKeyDown={handleEstimateKeyDown}
              className="h-8 w-12 text-sm text-center px-1 font-mono bg-white dark:bg-surface-1"
            />
          ) : (
            <span
              className={cn(
                "text-sm font-mono flex items-center justify-center min-w-8 h-8 rounded-md transition-colors",
                !isDemoMode && canManageIssues && "cursor-pointer hover:bg-gray-100 dark:hover:bg-surface-3 hover:text-blue-600 dark:hover:text-blue-400",
                issue.finalEstimate
                  ? (isCurrent ? "text-blue-700 dark:text-blue-300 font-bold" : "text-gray-900 dark:text-gray-100 font-semibold")
                  : "text-gray-400 dark:text-gray-500 font-medium"
              )}
              onClick={() => !isDemoMode && canManageIssues && setIsEditingEstimate(true)}
              title={isDemoMode || !canManageIssues ? (issue.finalEstimate ?? "No estimate") : "Click to edit estimate"}
            >
              {issue.finalEstimate ?? "-"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
