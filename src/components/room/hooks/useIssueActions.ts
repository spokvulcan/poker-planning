"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";
import { useStableActions } from "@/hooks/useStableActions";

/**
 * Every backend write the issues panel can trigger, behind one frozen-identity
 * object — the same seam shape as useCanvasActions.
 */
export interface IssueActions {
  /** Resolves to the new issue's id; in demo mode the write no-ops to `undefined`. */
  createIssue: (title: string) => Promise<Id<"issues"> | undefined>;
  startVoting: (issueId: Id<"issues">) => Promise<void>;
  switchToQuickVote: () => Promise<void>;
  updateTitle: (issueId: Id<"issues">, title: string) => Promise<void>;
  updateEstimate: (issueId: Id<"issues">, estimate: string) => Promise<void>;
  deleteIssue: (issueId: Id<"issues">) => Promise<void>;
  reorderIssues: (issueIds: Id<"issues">[]) => Promise<void>;
}

interface UseIssueActionsProps {
  roomId: Id<"rooms">;
}

/**
 * Owns the demo-vs-real decision once, at the action seam: inside a demo context
 * every method is a no-op, so "the demo never writes to the backend" (ADR-0003)
 * is one adapter rather than a guard at every control. Unlike useCanvasActions
 * the methods propagate failures instead of swallowing them — the panel owns the
 * failure toast. Frozen method identity comes from useStableActions, the
 * shared stabilizer every *Actions seam returns through.
 */
export function useIssueActions({ roomId }: UseIssueActionsProps): IssueActions {
  const isDemo = useDemoSimulation() !== null;

  const createMutation = useMutation(api.issues.create);
  const startVotingMutation = useMutation(api.issues.startVoting);
  const clearCurrentIssueMutation = useMutation(api.issues.clearCurrentIssue);
  const updateTitleMutation = useMutation(api.issues.updateTitle);
  const updateEstimateMutation = useMutation(api.issues.updateEstimate);
  const deleteMutation = useMutation(api.issues.remove);
  const reorderMutation = useMutation(api.issues.reorder);

  // The live implementations, recreated each render so they always close over
  // the latest roomId/mutations — no per-field refs needed.
  const impl: IssueActions = {
    createIssue: async (title) => {
      if (isDemo) return undefined;
      return await createMutation({ roomId, title });
    },
    startVoting: async (issueId) => {
      if (isDemo) return;
      await startVotingMutation({ roomId, issueId });
    },
    switchToQuickVote: async () => {
      if (isDemo) return;
      await clearCurrentIssueMutation({ roomId });
    },
    updateTitle: async (issueId, title) => {
      if (isDemo) return;
      await updateTitleMutation({ issueId, title });
    },
    updateEstimate: async (issueId, estimate) => {
      if (isDemo) return;
      await updateEstimateMutation({ issueId, finalEstimate: estimate });
    },
    deleteIssue: async (issueId) => {
      if (isDemo) return;
      await deleteMutation({ issueId });
    },
    reorderIssues: async (issueIds) => {
      if (isDemo) return;
      await reorderMutation({ roomId, issueIds });
    },
  };

  // Frozen identity comes from the one shared stabilizer (see useStableActions
  // for the full rationale): the returned wrapper is built once and always
  // invokes the latest closure.
  return useStableActions(impl);
}
