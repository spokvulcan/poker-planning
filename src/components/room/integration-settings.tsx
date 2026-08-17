"use client";

import { useState, useEffect, useCallback } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Puzzle, ExternalLink } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
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

export function IntegrationSettingsSection({
  roomId,
}: IntegrationSettingsSectionProps) {
  const connections = useQuery(api.integrations.getConnections);
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

  // Sync form state when mapping loads
  useEffect(() => {
    if (mapping) {
      setProjectKey(mapping.jiraProjectKey ?? "");
      setBoardId(mapping.jiraBoardId ?? null);
      setAutoPush(mapping.autoPushEstimates);
      setStoryPointsFieldId(mapping.storyPointsFieldId ?? "");
    }
  }, [mapping]);

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

  const handleSave = async () => {
    if (!jiraConnection || !projectKey) return;
    setSaving(true);
    try {
      await saveMapping({
        roomId,
        connectionId: jiraConnection._id,
        provider: "jira",
        jiraProjectKey: projectKey,
        jiraBoardId: boardId ?? undefined,
        autoImport: false, // Coming soon; keep disabled until implemented.
        autoPushEstimates: autoPush,
        storyPointsFieldId: storyPointsFieldId || undefined,
      });
      toast.success("Jira mapping saved");
    } catch {
      toast.error("Failed to save mapping");
    } finally {
      setSaving(false);
    }
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

      {/* Save / Remove buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!projectKey || saving}
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
