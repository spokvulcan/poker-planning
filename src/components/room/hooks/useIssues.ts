"use client";

import { useQuery, useMutation } from "convex/react";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import type { EnhancedExportableIssue } from "@/convex/model/issues";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";

interface UseIssuesProps {
  roomId: Id<"rooms">;
  isDemoMode?: boolean;
}

interface UseIssuesReturn {
  issues: Doc<"issues">[];
  currentIssue: Doc<"issues"> | null;
  isQuickVoteMode: boolean;
  isLoading: boolean;
  createIssue: (title: string) => Promise<Id<"issues">>;
  startVoting: (issueId: Id<"issues">) => Promise<void>;
  switchToQuickVote: () => Promise<void>;
  updateTitle: (issueId: Id<"issues">, title: string) => Promise<void>;
  updateEstimate: (issueId: Id<"issues">, estimate: string) => Promise<void>;
  deleteIssue: (issueId: Id<"issues">) => Promise<void>;
  reorderIssues: (issueIds: Id<"issues">[]) => Promise<void>;
  exportData: EnhancedExportableIssue[] | undefined;
}

export function useIssues({ roomId, isDemoMode = false }: UseIssuesProps): UseIssuesReturn {
  // In the Demo simulation, the issues list and current issue come from context
  // — never from Convex (zero reads, ADR-0003). Real rooms subscribe as before.
  const demo = useDemoSimulation();

  // Queries (skipped in demo mode; data is served from context below)
  const issuesQuery = useQuery(api.issues.list, demo ? "skip" : { roomId });
  const currentIssueQuery = useQuery(
    api.issues.getCurrent,
    demo ? "skip" : { roomId },
  );
  const exportData = useQuery(
    api.issues.getForEnhancedExport,
    demo || isDemoMode ? "skip" : { roomId },
  );

  const issues = demo ? demo.issues : (issuesQuery ?? []);
  const currentIssue = demo
    ? (demo.issues.find((i) => i._id === demo.currentIssue._id) ?? null)
    : (currentIssueQuery ?? null);

  // Mutations
  const createMutation = useMutation(api.issues.create);
  const startVotingMutation = useMutation(api.issues.startVoting);
  const clearCurrentIssueMutation = useMutation(api.issues.clearCurrentIssue);
  const updateTitleMutation = useMutation(api.issues.updateTitle);
  const updateEstimateMutation = useMutation(api.issues.updateEstimate);
  const deleteMutation = useMutation(api.issues.remove);
  const reorderMutation = useMutation(api.issues.reorder);

  const createIssue = useCallback(
    async (title: string) => {
      return await createMutation({ roomId, title });
    },
    [createMutation, roomId]
  );

  const startVoting = useCallback(
    async (issueId: Id<"issues">) => {
      await startVotingMutation({ roomId, issueId });
    },
    [startVotingMutation, roomId]
  );

  const switchToQuickVote = useCallback(async () => {
    await clearCurrentIssueMutation({ roomId });
  }, [clearCurrentIssueMutation, roomId]);

  const updateTitle = useCallback(
    async (issueId: Id<"issues">, title: string) => {
      await updateTitleMutation({ issueId, title });
    },
    [updateTitleMutation]
  );

  const updateEstimate = useCallback(
    async (issueId: Id<"issues">, estimate: string) => {
      await updateEstimateMutation({ issueId, finalEstimate: estimate });
    },
    [updateEstimateMutation]
  );

  const deleteIssue = useCallback(
    async (issueId: Id<"issues">) => {
      await deleteMutation({ issueId });
    },
    [deleteMutation]
  );

  const reorderIssues = useCallback(
    async (issueIds: Id<"issues">[]) => {
      await reorderMutation({ roomId, issueIds });
    },
    [reorderMutation, roomId]
  );

  return {
    issues,
    currentIssue,
    isQuickVoteMode: !currentIssue,
    isLoading: demo ? false : issuesQuery === undefined,
    createIssue,
    startVoting,
    switchToQuickVote,
    updateTitle,
    updateEstimate,
    deleteIssue,
    reorderIssues,
    exportData,
  };
}
