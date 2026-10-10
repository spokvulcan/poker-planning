"use client";

import { useState } from "react";
import type { Gif } from "@/convex/model/retro";
import type { StickyDraft } from "./types";

/**
 * The sticky the viewer is writing, one at a time. Once sent, the draft is
 * kept with what it says until the sticky lands: meanwhile its pending sticky
 * stands in for it on the board, and if the write is refused the draft comes
 * back as it was written. `add` writes the sticky and resolves to whether it
 * landed, as `runAct` does.
 */
export function useStickyDraft(add: (sticky: StickyDraft & { text: string }) => Promise<boolean>) {
  const [draft, setDraft] = useState<StickyDraft | null>(null);
  // Only while it is still the draft: another may have been started since.
  const putAway = (clientId: string) => setDraft((d) => (d?.clientId === clientId ? null : d));

  return {
    draft,
    /** Opens a new draft in place of any other, sent or not. */
    start: (columnId: string, position: { x: number; y: number }) =>
      setDraft({ clientId: crypto.randomUUID(), columnId, position }),
    /** Sends the draft as written, and puts it away once its sticky lands. */
    commit: async (clientId: string, text: string, gif: Gif | undefined) => {
      if (!draft || draft.clientId !== clientId) return;
      const sent = { clientId, columnId: draft.columnId, position: draft.position, text, ...(gif ? { gif } : {}) };
      setDraft(sent);
      if (await add(sent)) putAway(clientId);
    },
    cancel: putAway,
    /** Puts away any draft, sent or not, for an edit: one editor at a time. */
    close: () => setDraft(null),
  };
}
