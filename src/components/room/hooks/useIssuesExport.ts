"use client";

import { useCallback } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { EnhancedExportableIssue } from "@/convex/model/issues";
import { useIsDemoMode } from "../demo/DemoSimulationProvider";

interface UseIssuesExportProps {
  roomId: Id<"rooms">;
}

/**
 * The export flow's read side. `getForEnhancedExport` is the heaviest issues
 * read (full issue history for every issue in the room), so it is not part of
 * the panel's subscribed set: it is fetched once, imperatively, when an export
 * is actually invoked — never subscribed, so a panel that stays open costs
 * nothing and a closed panel costs nothing either.
 *
 * In the Demo simulation the export control is disabled; the fetch resolves to
 * an empty list without touching Convex (zero reads, ADR-0003).
 */
export function useIssuesExport({ roomId }: UseIssuesExportProps) {
  const convex = useConvex();
  const isDemoMode = useIsDemoMode();

  return useCallback(async (): Promise<EnhancedExportableIssue[]> => {
    if (isDemoMode) return [];
    return await convex.query(api.issues.getForEnhancedExport, { roomId });
  }, [convex, isDemoMode, roomId]);
}
