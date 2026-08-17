"use client";

import { FC, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { X, Download, FileSpreadsheet, FileJson, Plus, Loader2, Zap, ArrowRight, CloudDownload } from "lucide-react";
import { api } from "@/convex/_generated/api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useIssues } from "./hooks/useIssues";
import { useIssuesExport } from "./hooks/useIssuesExport";
import { useIssueActions } from "./hooks/useIssueActions";
import { useIsDemoMode } from "./demo/DemoSimulationProvider";
import { IssueItem } from "./issue-item";
import { JiraImportModal } from "./jira-import-modal";
import { exportIssuesToCSV } from "@/utils/export-issues-csv";
import { exportIssuesToJSON } from "@/utils/export-issues-json";
import type { Id } from "@/convex/_generated/dataModel";
import type { EnhancedExportableIssue } from "@/convex/model/issues";
import { type ResolvedDecision, RESOLVED_ALLOWED } from "@/convex/permissions";
import { denialTooltip, permissionProps } from "@/hooks/usePermissions";

interface IssuesPanelProps {
  roomId: Id<"rooms">;
  roomName: string;
  isOpen: boolean;
  onClose: () => void;
  canManageIssues?: ResolvedDecision;
  canControlGameFlow?: ResolvedDecision;
}

type IssuesPanelContentProps = Omit<IssuesPanelProps, "isOpen">;

/**
 * The animated panel shell stays mounted for the open/close transition; the
 * panel CONTENT mounts only while the panel is open, so every Convex
 * subscription below (issues list, current issue, integration links) attaches
 * on open and detaches on close instead of running for the whole session.
 * The even heavier export read is not a subscription at all — see
 * useIssuesExport.
 */
export const IssuesPanel: FC<IssuesPanelProps> = (props) => {
  const { isOpen, onClose } = props;
  return (
    <SidePanel isOpen={isOpen} onClose={onClose}>
      {isOpen ? <IssuesPanelContent {...props} /> : null}
    </SidePanel>
  );
};

const IssuesPanelContent: FC<IssuesPanelContentProps> = ({
  roomId,
  roomName,
  onClose,
  canManageIssues: canManageIssuesDecision = RESOLVED_ALLOWED,
  canControlGameFlow: canControlGameFlowDecision = RESOLVED_ALLOWED,
}) => {
  const isDemoMode = useIsDemoMode();
  // Resolved decisions in; booleans for gating and decision copy for denials.
  const canManageIssues = canManageIssuesDecision.allowed;
  const canControlGameFlow = canControlGameFlowDecision.allowed;
  const manageIssuesDenial = denialTooltip(canManageIssuesDecision);

  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [isAddingIssue, setIsAddingIssue] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const roomMapping = useQuery(api.integrations.getRoomMapping, isDemoMode ? "skip" : { roomId });
  const issueLinksMap = useQuery(api.integrations.getIssueLinks, isDemoMode ? "skip" : { roomId });
  const hasJiraMapping = !!roomMapping && roomMapping.provider === "jira";

  const {
    issues,
    currentIssue,
    isQuickVoteMode,
    isLoading,
  } = useIssues({ roomId });
  // The export read is fetched at click time, not subscribed (see the hook).
  const fetchExportData = useIssuesExport({ roomId });
  // Writes come from the action seam, which no-ops internally in demo mode
  // (ADR-0003) — the remaining `isDemoMode` branches below are presentation only
  // (hide/disable controls), never write guards.
  const {
    createIssue,
    startVoting,
    switchToQuickVote,
    updateTitle,
    updateEstimate,
    deleteIssue,
  } = useIssueActions({ roomId });

  const handleAddIssue = async () => {
    if (!newIssueTitle.trim()) return;

    setIsAddingIssue(true);
    try {
      await createIssue(newIssueTitle.trim());
      setNewIssueTitle("");
      toast.success("Issue added", {
        description: `"${newIssueTitle.trim()}" has been added to the list.`,
      });
    } catch (error) {
      console.error("Failed to add issue:", error);
      toast.error("Failed to add issue");
    } finally {
      setIsAddingIssue(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isAddingIssue) {
      handleAddIssue();
    }
  };

  const handleStartVoting = async (issueId: Id<"issues">) => {
    const issue = issues.find((i) => i._id === issueId);
    try {
      await startVoting(issueId);
      toast.success(issue ? `Voting on "${issue.title}"` : "Voting started", {
        description: "All previous votes have been cleared.",
      });
    } catch (error) {
      console.error("Failed to start voting:", error);
      toast.error("Failed to start voting");
    }
  };

  const handleSwitchToQuickVote = async () => {
    if (isQuickVoteMode) return; // Already in Quick Vote mode
    try {
      await switchToQuickVote();
      toast.success("Quick Vote", {
        description: "Switched to ad-hoc voting mode.",
      });
    } catch (error) {
      console.error("Failed to switch to Quick Vote:", error);
      toast.error("Failed to switch mode");
    }
  };

  const handleUpdateTitle = async (issueId: Id<"issues">, title: string) => {
    try {
      await updateTitle(issueId, title);
    } catch (error) {
      console.error("Failed to update title:", error);
      toast.error("Failed to update title");
    }
  };

  const handleUpdateEstimate = async (
    issueId: Id<"issues">,
    estimate: string
  ) => {
    try {
      await updateEstimate(issueId, estimate);
    } catch (error) {
      console.error("Failed to update estimate:", error);
      toast.error("Failed to update estimate");
    }
  };

  const handleDeleteIssue = async (issueId: Id<"issues">) => {
    try {
      await deleteIssue(issueId);
      toast.success("Issue deleted");
    } catch (error) {
      console.error("Failed to delete issue:", error);
      toast.error("Failed to delete issue");
    }
  };

  const handleExport = async (format: "csv" | "json") => {
    let exportData: EnhancedExportableIssue[];
    try {
      exportData = await fetchExportData();
    } catch (error) {
      console.error("Failed to export issues:", error);
      toast.error("Export failed");
      return;
    }

    if (exportData.length === 0) {
      toast.error("No issues to export", {
        description: "Add some issues first.",
      });
      return;
    }

    if (format === "csv") {
      exportIssuesToCSV(exportData, roomName);
    } else {
      exportIssuesToJSON(exportData, roomName);
    }
    toast.success("Export successful", {
      description: `Exported ${exportData.length} issues to ${format.toUpperCase()}.`,
    });
  };

  return (
    <>
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-gray-200/50 dark:border-border shrink-0 bg-white dark:bg-surface-1">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Issues
            </h2>
            <Badge variant="secondary" className="bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-400 font-medium px-2 py-0.5 rounded-full border-0">
              {issues.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {hasJiraMapping && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setImportOpen(true)}
                      className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                      aria-label="Import from Jira"
                    />
                  }
                >
                  <CloudDownload className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Import from Jira</p>
                </TooltipContent>
              </Tooltip>
            )}
          <DropdownMenu>
              <Tooltip>
                <TooltipTrigger render={<span />}>
                    <DropdownMenuTrigger
                      disabled={isDemoMode || issues.length === 0}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-surface-3 dark:hover:text-gray-100 disabled:pointer-events-none disabled:opacity-50 transition-colors"
                      aria-label="Export issues"
                    >
                      <Download className="h-4 w-4" />
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Export issues</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => handleExport("csv")} className="py-2 cursor-pointer">
                  <FileSpreadsheet className="mr-2 h-4 w-4 text-gray-500" />
                  <span className="font-medium">Export as CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")} className="py-2 cursor-pointer">
                  <FileJson className="mr-2 h-4 w-4 text-gray-500" />
                  <span className="font-medium">Export as JSON</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onClose}
                    className="h-8 w-8 ml-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-surface-3 dark:hover:text-gray-100"
                    aria-label="Close panel"
                  />
                }
              >
                <X className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Close panel</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col min-h-0 flex-1 bg-gray-50/50 dark:bg-surface-1/50">

          {/* Quick Vote Section - Always pinned to top of scroll */}
          <div className="p-6 pb-2 shrink-0">
            <button
              onClick={canControlGameFlow ? handleSwitchToQuickVote : undefined}
              disabled={isDemoMode}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl border bg-white dark:bg-surface-2 transition-all group shadow-sm",
                isQuickVoteMode
                  ? "border-blue-200 ring-1 ring-blue-500/20 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-900/50"
                  : "border-gray-200/50 dark:border-border hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md",
                isDemoMode && "cursor-default opacity-70",
                !canControlGameFlow && "cursor-not-allowed opacity-70"
              )}
              {...permissionProps(canControlGameFlowDecision)}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full transition-colors",
                  isQuickVoteMode
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
                    : "bg-gray-100 text-gray-500 dark:bg-surface-3 dark:text-gray-400 group-hover:bg-gray-200 dark:group-hover:bg-surface-3/80 group-hover:text-gray-700 dark:group-hover:text-gray-300"
                )}>
                  <Zap className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <h3 className={cn(
                    "text-sm font-medium",
                    isQuickVoteMode ? "text-blue-900 dark:text-blue-100" : "text-gray-900 dark:text-gray-100"
                  )}>
                    Quick Vote
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Ad-hoc voting without tracking
                  </p>
                </div>
              </div>
              {isQuickVoteMode && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-100/50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 text-[10px] font-semibold uppercase tracking-wider shrink-0 border border-blue-200/50 dark:border-blue-900/30">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                  </span>
                  Active
                </div>
              )}
            </button>
          </div>

          {/* Issues List */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="space-y-4 pt-2">
              {/* Backlog Header */}
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Backlog
                </h3>
              </div>

              {/* Add Issue Input */}
              {!isDemoMode && (
                <div className="relative group">
                  <Input
                    value={newIssueTitle}
                    onChange={(e) => setNewIssueTitle(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add new issue..."
                    className="h-10 w-full pr-12 text-sm bg-white dark:bg-surface-2 border-gray-200/80 dark:border-border rounded-lg shadow-sm focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:border-blue-500 transition-all placeholder:text-gray-400"
                    disabled={isAddingIssue || !canManageIssues}
                    title={manageIssuesDenial}
                  />
                  {newIssueTitle.trim() && (
                    <div className="absolute inset-y-0 right-1 flex items-center">
                      <Button
                        onClick={handleAddIssue}
                        disabled={isAddingIssue || !canManageIssues}
                        size="icon-sm"
                        className="h-8 w-8 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
                      >
                        {isAddingIssue ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Issues List container */}
              <div className="space-y-2 mt-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : issues.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 mt-2">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center">
                      Your backlog is empty
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {issues.map((issue) => (
                      <IssueItem
                        key={issue._id}
                        issue={issue}
                        isCurrent={currentIssue?._id === issue._id}
                        onStartVoting={handleStartVoting}
                        onUpdateTitle={handleUpdateTitle}
                        onUpdateEstimate={handleUpdateEstimate}
                        onDelete={handleDeleteIssue}
                        canManageIssues={canManageIssuesDecision}
                        canControlGameFlow={canControlGameFlowDecision}
                        issueLink={issueLinksMap?.[issue._id] ?? undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Demo CTA */}
          {isDemoMode && (
            <div className="p-6 border-t border-gray-200/50 dark:border-border bg-white dark:bg-surface-1">
              <Link href="/room/new">
                <Button className="w-full gap-2 h-12 text-sm font-medium shadow-sm rounded-xl">
                  Start your session to track issues
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </div>

    {hasJiraMapping && (
      <JiraImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        roomId={roomId}
      />
    )}
    </>
  );
};
