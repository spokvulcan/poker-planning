"use client";

import { useState, useCallback, useEffect } from "react";
import { useAction } from "convex/react";
import { Loader2, ChevronRight, Check } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";


import { toast } from "@/lib/toast";

interface JiraImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: Id<"rooms">;
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
}

interface JiraBoard {
  id: number;
  name: string;
  type: string;
}

interface JiraSprint {
  id: number;
  name: string;
  state: string;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    issuetype: { name: string };
    status: { name: string };
  };
}

type Step = "project" | "board" | "sprint" | "issues";

export function JiraImportModal({
  open,
  onOpenChange,
  roomId,
}: JiraImportModalProps) {
  const getProjects = useAction(api.integrations.jira.getJiraProjects);
  const getBoards = useAction(api.integrations.jira.getJiraBoards);
  const getSprints = useAction(api.integrations.jira.getJiraSprints);
  const getIssues = useAction(api.integrations.jira.getJiraIssues);
  const importAction = useAction(api.integrations.jira.importIssues);

  const [step, setStep] = useState<Step>("project");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Data
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [boards, setBoards] = useState<JiraBoard[]>([]);
  const [sprints, setSprints] = useState<JiraSprint[]>([]);
  const [issues, setIssues] = useState<JiraIssue[]>([]);

  // Selections
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [, setSelectedBoard] = useState<number | null>(null);
  const [, setSelectedSprint] = useState<number | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());

  const reset = useCallback(() => {
    setStep("project");
    setProjects([]);
    setBoards([]);
    setSprints([]);
    setIssues([]);
    setSelectedProject("");
    setSelectedBoard(null);
    setSelectedSprint(null);
    setSelectedIssues(new Set());
    setLoading(false);
    setImporting(false);
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) reset();
    onOpenChange(newOpen);
  };

  // Load projects whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const result = await getProjects();
        if (!cancelled) setProjects(result);
      } catch {
        if (!cancelled) {
          toast.error("Failed to load projects", {
            description: "Check your Jira connection and try again.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleProjectSelect = async (projectKey: string) => {
    setSelectedProject(projectKey);
    setLoading(true);
    try {
      const result = await getBoards({ projectKey });
      setBoards(result);
      setStep("board");
    } catch {
      toast.error("Failed to load boards");
    } finally {
      setLoading(false);
    }
  };

  const handleBoardSelect = async (boardId: number) => {
    setSelectedBoard(boardId);
    setLoading(true);
    try {
      const result = await getSprints({ boardId });
      setSprints(result);
      setStep("sprint");
    } catch {
      toast.error("Failed to load sprints");
    } finally {
      setLoading(false);
    }
  };

  const handleSprintSelect = async (sprintId: number | null) => {
    setSelectedSprint(sprintId);
    setLoading(true);
    try {
      const result = await getIssues({
        projectKey: selectedProject,
        sprintId: sprintId ?? undefined,
      });
      setIssues(result);
      setStep("issues");
    } catch {
      toast.error("Failed to load issues");
    } finally {
      setLoading(false);
    }
  };

  const toggleIssue = (key: string) => {
    setSelectedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIssues.size === issues.length) {
      setSelectedIssues(new Set());
    } else {
      setSelectedIssues(new Set(issues.map((i) => i.key)));
    }
  };

  const handleImport = async () => {
    if (selectedIssues.size === 0) return;
    setImporting(true);
    try {
      const result = await importAction({
        roomId,
        jiraIssueKeys: Array.from(selectedIssues),
      });
      toast.success("Import complete", {
        description: `Imported ${result.imported} issue${result.imported !== 1 ? "s" : ""}${result.skipped > 0 ? `, ${result.skipped} already existed` : ""}.`,
      });
      handleOpenChange(false);
    } catch {
      toast.error("Import failed", {
        description: "An error occurred during import.",
      });
    } finally {
      setImporting(false);
    }
  };

  const stepTitles: Record<Step, string> = {
    project: "Select a Jira Project",
    board: "Select a Board",
    sprint: "Select a Sprint",
    issues: "Select Issues to Import",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{stepTitles[step]}</DialogTitle>
          <DialogDescription>
            {step === "project" && "Choose which project to import issues from."}
            {step === "board" && (
              <span className="flex items-center gap-1">
                {selectedProject} <ChevronRight className="h-3 w-3" /> Board
              </span>
            )}
            {step === "sprint" && (
              <span className="flex items-center gap-1">
                {selectedProject} <ChevronRight className="h-3 w-3" /> Sprint or Backlog
              </span>
            )}
            {step === "issues" &&
              `${selectedIssues.size} of ${issues.length} selected`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Project selection */}
              {step === "project" && (
                <div className="space-y-1">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleProjectSelect(p.key)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-surface-3 transition-colors text-left"
                    >
                      <div>
                        <span className="font-medium text-sm">{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {p.key}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No projects found in your Jira instance.
                    </p>
                  )}
                </div>
              )}

              {/* Board selection */}
              {step === "board" && (
                <div className="space-y-1">
                  {boards.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => handleBoardSelect(b.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-surface-3 transition-colors text-left"
                    >
                      <div>
                        <span className="font-medium text-sm">{b.name}</span>
                        <span className="text-xs text-muted-foreground ml-2 capitalize">
                          {b.type}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {/* Sprint selection */}
              {step === "sprint" && (
                <div className="space-y-1">
                  <button
                    onClick={() => handleSprintSelect(null)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-surface-3 transition-colors text-left"
                  >
                    <span className="font-medium text-sm">Backlog</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {sprints.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSprintSelect(s.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-surface-3 transition-colors text-left"
                    >
                      <div>
                        <span className="font-medium text-sm">{s.name}</span>
                        <span className="text-xs text-muted-foreground ml-2 capitalize">
                          {s.state}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {/* Issue selection */}
              {step === "issues" && (
                <div className="space-y-1">
                  {issues.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200/50 dark:border-border mb-1">
                      <Checkbox
                        checked={selectedIssues.size === issues.length}
                        onCheckedChange={toggleAll}
                      />
                      <span className="text-xs text-muted-foreground">
                        Select all
                      </span>
                    </div>
                  )}
                  {issues.map((issue) => (
                    <label
                      key={issue.id}
                      className="flex items-start gap-3 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-surface-3 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIssues.has(issue.key)}
                        onCheckedChange={() => toggleIssue(issue.key)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">
                            {issue.key}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-surface-2 text-muted-foreground">
                            {issue.fields.status.name}
                          </span>
                        </div>
                        <p className="text-sm mt-0.5 truncate">
                          {issue.fields.summary}
                        </p>
                      </div>
                    </label>
                  ))}
                  {issues.length === 0 && (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No issues found.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {step === "issues" && (
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setStep("sprint")}
              disabled={importing}
            >
              Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={selectedIssues.size === 0 || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  Import {selectedIssues.size} issue
                  {selectedIssues.size !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
