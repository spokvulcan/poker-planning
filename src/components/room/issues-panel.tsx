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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIssues } from "./hooks/useIssues";
import { useIsDemoMode } from "./demo/DemoSimulationProvider";
import { IssueItem } from "./issue-item";
import { JiraImportModal } from "./jira-import-modal";
import { exportIssuesToCSV } from "@/utils/export-issues-csv";
import { exportIssuesToJSON } from "@/utils/export-issues-json";
import type { Id } from "@/convex/_generated/dataModel";
import { type ResolvedDecision, RESOLVED_ALLOWED } from "@/convex/permissions";

interface IssuesPanelProps {
  roomId: Id<"rooms">;
  roomName: string;
  isOpen: boolean;
  onClose: () => void;
  canManageIssues?: ResolvedDecision;
  canControlGameFlow?: ResolvedDecision;
}

export const IssuesPanel: FC<IssuesPanelProps> = ({
  roomId,
  roomName,
  isOpen,
  onClose,
  canManageIssues: canManageIssuesDecision = RESOLVED_ALLOWED,
  canControlGameFlow: canControlGameFlowDecision = RESOLVED_ALLOWED,
}) => {
  // The demo signal comes from the provider seam (#214), not a threaded prop;
  // it gates the integration queries below and the child issue rows.
  const isDemoMode = useIsDemoMode();
  // Resolved decisions in; booleans for gating and a message for denial copy.
  const canManageIssues = canManageIssuesDecision.allowed;
  const manageIssuesDenial = canManageIssuesDecision.allowed
    ? undefined
    : canManageIssuesDecision.message;
  const { toast } = useToast();

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
    createIssue,
    startVoting,
    switchToQuickVote,
    updateTitle,
    updateEstimate,
    deleteIssue,
    exportData,
  } = useIssues({ roomId });

  const handleAddIssue = async () => {
    if (!newIssueTitle.trim()) return;

    setIsAddingIssue(true);
    try {
      await createIssue(newIssueTitle.trim());
      setNewIssueTitle("");
      toast({
        title: "Issue added",
        description: `"${newIssueTitle.trim()}" has been added to the list.`,
      });
    } catch (error) {
      console.error("Failed to add issue:", error);
      toast({
        title: "Failed to add issue",
        variant: "destructive",
      });
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
      toast({
        title: issue ? `Voting on "${issue.title}"` : "Voting started",
        description: "All previous votes have been cleared.",
      });
    } catch (error) {
      console.error("Failed to start voting:", error);
      toast({
        title: "Failed to start voting",
        variant: "destructive",
      });
    }
  };

  const handleSwitchToQuickVote = async () => {
    if (isQuickVoteMode) return; // Already in Quick Vote mode
    try {
      await switchToQuickVote();
      toast({
        title: "Quick Vote",
        description: "Switched to ad-hoc voting mode.",
      });
    } catch (error) {
      console.error("Failed to switch to Quick Vote:", error);
      toast({
        title: "Failed to switch mode",
        variant: "destructive",
      });
    }
  };

  const handleUpdateTitle = async (issueId: Id<"issues">, title: string) => {
    try {
      await updateTitle(issueId, title);
    } catch (error) {
      console.error("Failed to update title:", error);
      toast({
        title: "Failed to update title",
        variant: "destructive",
      });
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
      toast({
        title: "Failed to update estimate",
        variant: "destructive",
      });
    }
  };

  const handleDeleteIssue = async (issueId: Id<"issues">) => {
    try {
      await deleteIssue(issueId);
      toast({
        title: "Issue deleted",
      });
    } catch (error) {
      console.error("Failed to delete issue:", error);
      toast({
        title: "Failed to delete issue",
        variant: "destructive",
      });
    }
  };

  const handleExport = (format: "csv" | "json") => {
    if (!exportData || exportData.length === 0) {
      toast({
        title: "No issues to export",
        description: "Add some issues first.",
        variant: "destructive",
      });
      return;
    }

    if (format === "csv") {
      exportIssuesToCSV(exportData, roomName);
    } else {
      exportIssuesToJSON(exportData, roomName);
    }
    toast({
      title: "Export successful",
      description: `Exported ${exportData.length} issues to ${format.toUpperCase()}.`,
    });
  };

  return (
    <>
    <SidePanel isOpen={isOpen} onClose={onClose}>
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
              onClick={isDemoMode ? undefined : handleSwitchToQuickVote}
              disabled={isDemoMode}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl border bg-white dark:bg-surface-2 transition-all group shadow-sm",
                isQuickVoteMode
                  ? "border-blue-200 ring-1 ring-blue-500/20 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-900/50"
                  : "border-gray-200/50 dark:border-border hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md",
                isDemoMode && "cursor-default opacity-70"
              )}
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
    </SidePanel>

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
