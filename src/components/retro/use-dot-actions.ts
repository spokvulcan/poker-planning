"use client";

import { useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TallyRead, TopicRef } from "@/convex/model/retroVotes";
import { failureCopy, retryWrite } from "@/lib/write-retry";
import { toast } from "@/lib/toast";
import { DOT_ACT_FAILED } from "@/convex/retroCopy";
import { dotRefusal, topicKey } from "./dots";
import { applyPlaceDot, applyRemoveDot } from "./optimistic";

export interface DotActions {
  /** One dot on the topic: refused in the browser at the cap, else optimistic and retried. */
  place: (target: TopicRef) => void;
  /** One of the viewer's own dots off the topic. */
  remove: (target: TopicRef) => void;
}

/** The refusal's reason, or the fallback for a failure that outlived its retries. */
function surface(error: unknown): void {
  toast.error(failureCopy(error, DOT_ACT_FAILED));
}

/**
 * The dot writes (spec §10.7, §10.8, §11): both optimistic against
 * `retro.tally`, a transient failure retried, a refusal dropped at once
 * with its reason. The local refusal reads the tally the hook is given, so
 * a dot past the budget or the topic's cap never leaves the browser.
 */
export function useDotActions(roomId: Id<"rooms">, tally: TallyRead | undefined): DotActions {
  const placeDot = useMutation(api.retro.placeDot);
  const removeDot = useMutation(api.retro.removeDot);
  const optimisticPlace = useMemo(() => placeDot.withOptimisticUpdate(applyPlaceDot), [placeDot]);
  const optimisticRemove = useMemo(() => removeDot.withOptimisticUpdate(applyRemoveDot), [removeDot]);

  const place = useCallback<DotActions["place"]>(
    (target) => {
      const refused = dotRefusal(tally, topicKey(target));
      if (refused) {
        toast.error(refused);
        return;
      }
      void retryWrite(() => optimisticPlace({ roomId, target })).catch(surface);
    },
    [optimisticPlace, roomId, tally]
  );

  const remove = useCallback<DotActions["remove"]>(
    (target) => {
      void retryWrite(() => optimisticRemove({ roomId, target })).catch(surface);
    },
    [optimisticRemove, roomId]
  );

  return useMemo(() => ({ place, remove }), [place, remove]);
}
