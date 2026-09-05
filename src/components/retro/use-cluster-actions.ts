"use client";

import { useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { failureCopy, retryWrite } from "@/lib/write-retry";
import { toast } from "@/lib/toast";
import { CLUSTER_ACT_FAILED } from "@/convex/retroCopy";
import { applyAddToCluster, applyFormCluster, applyUngroup } from "./optimistic";

export interface ClusterActions {
  /** Form a cluster from a selection; fire and forget, the board settles by itself. */
  form: (clientIds: string[]) => void;
  addTo: (clusterId: Id<"retroClusters">, clientIds: string[]) => void;
  removeFrom: (clientIds: string[]) => void;
  /** The `cardManagement` acts resolve to whether they went through; a refusal toasts its reason. */
  rename: (clusterId: Id<"retroClusters">, name: string) => Promise<boolean>;
  merge: (from: Id<"retroClusters">, into: Id<"retroClusters">) => Promise<boolean>;
  /**
   * Dissolve: done, failed, or — when the cluster has dots and no consent
   * was given — the count to confirm with (spec §10.3, §19).
   */
  dissolve: (clusterId: Id<"retroClusters">, removeVotes?: boolean) => Promise<DissolveResult>;
}

export type DissolveResult = "done" | "failed" | { votes: number };

/** The refusal's reason, or the fallback for a failure that outlived its retries. */
function surface(error: unknown): void {
  toast.error(failureCopy(error, CLUSTER_ACT_FAILED));
}

/** One non-optimistic act: whether it went through, a failure surfaced as its copy. */
async function act(write: Promise<unknown>): Promise<boolean> {
  try {
    await write;
    return true;
  } catch (error) {
    surface(error);
    return false;
  }
}

/**
 * The cluster writes (spec §10.3, §10.7): group and ungroup are optimistic
 * and retried on failure like a move; rename, merge and dissolve are not
 * optimistic (the board settles on the server's answer) and surface a
 * refusal as its copy. Tidy is not here: it is the one move batch, issued
 * by the board through the card actions.
 */
export function useClusterActions(roomId: Id<"rooms">): ClusterActions {
  const formCluster = useMutation(api.retro.formCluster);
  const addToCluster = useMutation(api.retro.addToCluster);
  const removeFromCluster = useMutation(api.retro.removeFromCluster);
  const renameCluster = useMutation(api.retro.renameCluster);
  const mergeClusters = useMutation(api.retro.mergeClusters);
  const dissolveCluster = useMutation(api.retro.dissolveCluster);

  const optimisticAdd = useMemo(() => addToCluster.withOptimisticUpdate(applyAddToCluster), [addToCluster]);
  const optimisticRemove = useMemo(() => removeFromCluster.withOptimisticUpdate(applyUngroup), [removeFromCluster]);

  const form = useCallback<ClusterActions["form"]>(
    (clientIds) => {
      // The placeholder id is minted once per gesture, so a retry re-points
      // the same optimistic row rather than adding another.
      const placeholderId = `optimistic-${crypto.randomUUID()}`;
      const optimisticForm = formCluster.withOptimisticUpdate((store, args) =>
        applyFormCluster(store, args, placeholderId)
      );
      void retryWrite(() => optimisticForm({ roomId, clientIds })).catch(surface);
    },
    [formCluster, roomId]
  );

  const addTo = useCallback<ClusterActions["addTo"]>(
    (clusterId, clientIds) => {
      void retryWrite(() => optimisticAdd({ roomId, clusterId, clientIds })).catch(surface);
    },
    [optimisticAdd, roomId]
  );

  const removeFrom = useCallback<ClusterActions["removeFrom"]>(
    (clientIds) => {
      void retryWrite(() => optimisticRemove({ roomId, clientIds })).catch(surface);
    },
    [optimisticRemove, roomId]
  );

  const rename = useCallback<ClusterActions["rename"]>(
    (clusterId, name) => act(renameCluster({ roomId, clusterId, name })),
    [renameCluster, roomId]
  );

  const merge = useCallback<ClusterActions["merge"]>(
    (from, into) => act(mergeClusters({ roomId, from, into })),
    [mergeClusters, roomId]
  );

  const dissolve = useCallback<ClusterActions["dissolve"]>(
    async (clusterId, removeVotes) => {
      try {
        const outcome = await dissolveCluster({ roomId, clusterId, ...(removeVotes ? { removeVotes } : {}) });
        return outcome.dissolved ? "done" : { votes: outcome.votes };
      } catch (error) {
        surface(error);
        return "failed";
      }
    },
    [dissolveCluster, roomId]
  );

  return useMemo(
    () => ({ form, addTo, removeFrom, rename, merge, dissolve }),
    [form, addTo, removeFrom, rename, merge, dissolve]
  );
}
