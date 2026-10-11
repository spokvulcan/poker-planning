"use client";

import { useState, useEffect, useCallback } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Puzzle, ExternalLink, AlertTriangle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useCallerQuery } from "@/components/auth/use-caller-query";
import { autoPushProblem } from "@/convex/autoPush";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { runAct } from "@/lib/run-act";
import type { LastPush } from "@/convex/model/estimatePush";

interface IntegrationSettingsSectionProps {
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

/** Why the mapping's last webhook registration failed, as the reconcile recorded it. */
const WEBHOOK_FAILURE_COPY: Record<
  NonNullable<Doc<"integrationMappings">["jiraWebhookFailure"]>,
  string
> = {
  missingSecret:
    "Jira renames and deletions won't reach this room: the server has no Jira webhook secret configured.",
  jiraError:
    "Jira renames and deletions won't reach this room: Jira didn't accept the webhook. Save again to retry.",
};

/** How the last settled estimate's push went, as the estimate push recorded it on the mapping. */
const LAST_PUSH_COPY: Record<LastPush["outcome"], (push: LastPush) => string> = {
  pushed: ({ issueKey, estimate }) => `Last estimate pushed: ${estimate} to ${issueKey}.`,
  noField: ({ issueKey }) =>
    `${issueKey}'s estimate wasn't pushed: choose the story points field estimates go to.`,
  notANumber: ({ issueKey, estimate }) =>
    `${issueKey}'s estimate "${estimate}" wasn't pushed: only a number can be story points.`,
  otherSite: ({ issueKey }) =>
    `${issueKey}'s estimate wasn't pushed: it was imported from another Jira site than the one this room's mapping pushes to.`,
  connectionUnusable: ({ issueKey }) =>
    `${issueKey}'s estimate wasn't pushed: the Jira connection this room pushes with no longer works. Reconnect Jira, then save the mapping again.`,
  refused: ({ issueKey }) => `${issueKey}'s estimate wasn't pushed: Jira refused it.`,
};

export function IntegrationSettingsSection({
  roomId,
}: IntegrationSettingsSectionProps) {
  const connections = useCallerQuery(api.integrations.getConnections);
  const mapping = useQuery(api.integrations.getRoomMapping, { roomId });
  const saveMapping = useMutation(api.integrations.saveRoomMapping);
  const removeMapping = useMutation(api.integrations.removeRoomMapping);
  const getProjects = useAction(api.integrations.jira.getJiraProjects);
  const getBoards = useAction(api.integrations.jira.getJiraBoards);
  const detectField = useAction(api.integrations.jira.detectStoryPointsField);

  const jiraConnection = connections?.find((c) => c.provider === "jira");

  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [boards, setBoards] = useState<JiraBoard[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [saving, setSaving] = useState(false);
  // From a save until the webhook the mapping wants is registered, or its
  // registration fails: the save's toast says which.
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);

  // Form state
  const [projectKey, setProjectKey] = useState(
    mapping?.jiraProjectKey ?? ""
  );
  const [boardId, setBoardId] = useState<number | null>(
    mapping?.jiraBoardId ?? null
  );
  const [autoPush, setAutoPush] = useState(
    mapping?.autoPushEstimates ?? false
  );
  const [storyPointsFieldId, setStoryPointsFieldId] = useState(
    mapping?.storyPointsFieldId ?? ""
  );

  // The form takes the saved settings when they load or a save changes them,
  // and only then: the mapping's row also changes as its webhook is recorded
  // and with every estimate pushed, which must not undo what is being typed.
  const hasMapping = !!mapping;
  const savedProjectKey = mapping?.jiraProjectKey ?? "";
  const savedBoardId = mapping?.jiraBoardId ?? null;
  const savedAutoPush = mapping?.autoPushEstimates ?? false;
  const savedFieldId = mapping?.storyPointsFieldId ?? "";
  useEffect(() => {
    if (!hasMapping) return;
    setProjectKey(savedProjectKey);
    setBoardId(savedBoardId);
    setAutoPush(savedAutoPush);
    setStoryPointsFieldId(savedFieldId);
  }, [hasMapping, savedProjectKey, savedBoardId, savedAutoPush, savedFieldId]);

  // A saved mapping that wants a webhook is saved for good once its webhook
  // is on record; a registration that failed is on record instead, and the
  // person who saved it hears so, not that all went well.
  useEffect(() => {
    if (!awaitingWebhook || !mapping) return;
    if (mapping.jiraWebhookFailure) {
      setAwaitingWebhook(false);
      toast.error("Jira mapping saved, but its webhook failed", {
        description: WEBHOOK_FAILURE_COPY[mapping.jiraWebhookFailure],
      });
    } else if (!mapping.autoPushEstimates || mapping.jiraWebhookId) {
      setAwaitingWebhook(false);
      toast.success("Jira mapping saved");
    }
  }, [awaitingWebhook, mapping]);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const result = await getProjects();
      setProjects(result);
    } catch {
      // Connection may not exist yet
    } finally {
      setLoadingProjects(false);
    }
  }, [getProjects]);

  // Load projects when connection exists
  useEffect(() => {
    if (jiraConnection && projects.length === 0) {
      loadProjects();
    }
  }, [jiraConnection, projects.length, loadProjects]);

  // Load boards when project key is set (from mapping or user selection)
  useEffect(() => {
    if (!projectKey || !jiraConnection) return;
    let cancelled = false;

    async function loadBoards() {
      setLoadingBoards(true);
      try {
        const result = await getBoards({ projectKey });
        if (!cancelled) setBoards(result);
      } catch {
        // Silently fail — boards will be empty
      } finally {
        if (!cancelled) setLoadingBoards(false);
      }
    }

    loadBoards();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey, jiraConnection]);

  const handleProjectChange = (key: string) => {
    setProjectKey(key);
    setBoardId(null);
    // Boards will load via the useEffect above
  };

  const handleDetectField = async () => {
    try {
      const fieldId = await detectField();
      if (fieldId) {
        setStoryPointsFieldId(fieldId);
        toast.success("Story points field detected", {
          description: fieldId,
        });
      } else {
        // Default variant, as before the toast wrapper removal.
        toast.success("Not found", {
          description:
            "Could not auto-detect story points field. Enter the custom field ID manually.",
        });
      }
    } catch {
      toast.error("Detection failed");
    }
  };

  // Auto-push writes each estimate to a field: without one it would push
  // nothing on every reveal, so the server refuses to save it that way, in
  // the words shown here (convex/autoPush.ts).
  const missingField = autoPushProblem({ autoPushEstimates: autoPush, storyPointsFieldId });

  const handleSave = async () => {
    if (!jiraConnection || !projectKey || missingField) return;
    setSaving(true);
    const saved = await runAct(
      saveMapping({
        roomId,
        connectionId: jiraConnection._id,
        provider: "jira",
        jiraProjectKey: projectKey,
        jiraBoardId: boardId ?? undefined,
        autoImport: false, // Coming soon; keep disabled until implemented.
        autoPushEstimates: autoPush,
        storyPointsFieldId: storyPointsFieldId.trim() || undefined,
      }),
      "Failed to save mapping"
    );
    // The save is back with the mapping as it saved it; the effect above
    // says how it went once its webhook is settled.
    if (saved) setAwaitingWebhook(true);
    setSaving(false);
  };

  const handleRemove = async () => {
    try {
      await removeMapping({ roomId });
      setProjectKey("");
      setBoardId(null);
      setAutoPush(false);
      setStoryPointsFieldId("");
      toast.success("Jira mapping removed");
    } catch {
      toast.error("Failed to remove mapping");
    }
  };

  // Don't show section if no Jira connection
  if (!jiraConnection) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Jira Integration</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect your Jira account in{" "}
          <a
            href="/dashboard/settings?tab=integrations"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Settings <ExternalLink className="h-3 w-3" />
          </a>{" "}
          to enable issue import and estimate sync.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Puzzle className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Jira Integration</h3>
      </div>

      {/* Project select */}
      <div className="space-y-2">
        <Label className="text-xs">Project</Label>
        {loadingProjects ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading projects...
          </div>
        ) : (
          <Select value={projectKey} onValueChange={(v) => v && handleProjectChange(v)}>
            <SelectTrigger size="sm">
              {projectKey || "Select a project"}
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.key}>
                  {p.name} ({p.key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Board select */}
      {projectKey && (
        <div className="space-y-2">
          <Label className="text-xs">Board</Label>
          {loadingBoards ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading boards...
            </div>
          ) : (
            <Select
              value={boardId?.toString() ?? ""}
              onValueChange={(v) => v && setBoardId(parseInt(v))}
            >
              <SelectTrigger size="sm">
                {boardId
                  ? boards.find((b) => b.id === boardId)?.name ?? "Select"
                  : "Select a board"}
              </SelectTrigger>
              <SelectContent>
                {boards.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Story points field */}
      {projectKey && (
        <div className="space-y-2">
          <Label className="text-xs">Story Points Field</Label>
          <div className="flex gap-2">
            <input
              type="text"
              value={storyPointsFieldId}
              onChange={(e) => setStoryPointsFieldId(e.target.value)}
              placeholder="e.g., customfield_10016"
              className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleDetectField}
              className="text-xs h-8"
            >
              Auto-detect
            </Button>
          </div>
        </div>
      )}

      {/* Toggle: auto-import (not implemented yet) */}
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-import" className="text-xs">
          Auto-import new sprint issues (coming soon)
        </Label>
        <Switch
          id="auto-import"
          size="sm"
          checked={false}
          disabled
        />
      </div>

      {/* Toggle: auto-push */}
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-push" className="text-xs">
          Auto-push estimates to Jira
        </Label>
        <Switch
          id="auto-push"
          size="sm"
          checked={autoPush}
          onCheckedChange={setAutoPush}
        />
      </div>
      {missingField && <p className="text-xs text-muted-foreground">{missingField}</p>}

      {mapping?.autoPushEstimates && mapping.lastPush && (
        <LastPushLine lastPush={mapping.lastPush} />
      )}

      {mapping?.jiraWebhookFailure && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md px-3 py-2 bg-amber-50 dark:bg-status-warning-bg"
        >
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-status-warning-fg" />
          <span className="text-xs text-amber-700 dark:text-status-warning-fg">
            {WEBHOOK_FAILURE_COPY[mapping.jiraWebhookFailure]}
          </span>
        </div>
      )}

      {/* Save / Remove buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!projectKey || !!missingField || saving}
          className="text-xs"
        >
          {saving ? "Saving..." : mapping ? "Update Mapping" : "Save Mapping"}
        </Button>
        {mapping && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemove}
            className="text-xs"
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * How the last estimate's push went: a quiet line when it went, and the way a
 * failed webhook shows when it didn't, with Jira's own words when Jira
 * refused it.
 */
function LastPushLine({ lastPush }: { lastPush: LastPush }) {
  const words = LAST_PUSH_COPY[lastPush.outcome](lastPush);
  if (lastPush.outcome === "pushed") {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {words}
      </p>
    );
  }
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md px-3 py-2 bg-amber-50 dark:bg-status-warning-bg"
    >
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-status-warning-fg" />
      <span className="text-xs text-amber-700 dark:text-status-warning-fg">
        {words}
        {lastPush.message && <span className="block mt-1 break-words opacity-80">{lastPush.message}</span>}
      </span>
    </div>
  );
}
