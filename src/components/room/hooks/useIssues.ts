"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { useDemoSimulation } from "../demo/DemoSimulationProvider";

interface UseIssuesProps {
  roomId: Id<"rooms">;
  /** The issue the round is on, as the room's row names it; none for a Quick Vote. */
  currentIssueId?: Id<"issues">;
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
 * — never from Convex (zero reads, ADR-0003). Real rooms subscribe to the
 * list, and find the current issue in it by the id the room's row names, so
 * nothing here reads the room's row, which every vote patches. The demo
 * signal is derived from that same context (#214), not a prop.
 *
 * The panel mounts this hook only while it is open, so the subscription
 * detaches on close. The heavy export read is deliberately NOT here: it is
 * fetched once per export click via useIssuesExport.
 */
export function useIssues({ roomId, currentIssueId }: UseIssuesProps): UseIssuesReturn {
  const demo = useDemoSimulation();

  // Skipped in demo mode; data is served from context below.
  const issuesQuery = useQuery(api.issues.list, demo ? "skip" : { roomId });

  const issues = demo ? demo.issues : (issuesQuery ?? []);
  const currentId = demo ? demo.currentIssue._id : currentIssueId;
  const currentIssue = currentId ? (issues.find((i) => i._id === currentId) ?? null) : null;

  return {
    issues,
    currentIssue,
    isQuickVoteMode: !currentIssue,
    isLoading: demo ? false : issuesQuery === undefined,
  };
}
