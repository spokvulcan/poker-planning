"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";

interface UseIssuesProps {
  roomId: Id<"rooms">;
}

interface UseIssuesReturn {
  issues: Doc<"issues">[];
  currentIssue: Doc<"issues"> | null;
  isQuickVoteMode: boolean;
  isLoading: boolean;
}

/**
 * The read half of the issues panel. The write half lives behind the
 * useIssueActions seam, which owns the demo no-op internally (ADR-0003).
 *
 * In the Demo simulation, the issues list and current issue come from context
 * — never from Convex (zero reads, ADR-0003). Real rooms subscribe as before.
 * The demo signal is derived from that same context (#214), not a prop.
 *
 * The panel mounts this hook only while it is open, so these subscriptions
 * detach on close. The heavy export read is deliberately NOT here: it is
 * fetched once per export click via useIssuesExport.
 */
export function useIssues({ roomId }: UseIssuesProps): UseIssuesReturn {
  const demo = useDemoSimulation();

  // Queries (skipped in demo mode; data is served from context below)
  const issuesQuery = useQuery(api.issues.list, demo ? "skip" : { roomId });
  const currentIssueQuery = useQuery(
    api.issues.getCurrent,
    demo ? "skip" : { roomId },
  );

  const issues = demo ? demo.issues : (issuesQuery ?? []);
  const currentIssue = demo
    ? (demo.issues.find((i) => i._id === demo.currentIssue._id) ?? null)
    : (currentIssueQuery ?? null);

  return {
    issues,
    currentIssue,
    isQuickVoteMode: !currentIssue,
    isLoading: demo ? false : issuesQuery === undefined,
  };
}
