"use client";

import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { Gif } from "@/convex/model/retro";
import type { StickyEdit } from "./types";

/** An edit as the editor sends it: the sticky, and its words and GIF as they now stand. */
export interface SentEdit {
  stickyId: Id<"retroStickies">;
  text: string;
  gif: Gif | null;
}

/**
 * The sticky the viewer is editing, one at a time, as useStickyDraft holds a
 * sticky being written. Once sent, the edit is kept with what it says until
 * it lands: meanwhile the editor is closed and the sticky shows the new
 * words, as the write's optimistic update draws them, and if the write is
 * refused the editor opens again on the words as they were typed. `save`
 * writes the edit and resolves to whether it landed, as `runAct` does.
 */
export function useStickyEdit(save: (edit: SentEdit) => Promise<boolean>) {
  const [edit, setEdit] = useState<(StickyEdit & { sent?: true }) | null>(null);

  return {
    /** The sticky open in the editor, with what an edit that didn't save said. */
    editing: edit && !edit.sent ? edit : null,
    /** Opens a sticky in the editor in place of any other edit, sent or not. */
    start: (stickyId: Id<"retroStickies">) => setEdit({ stickyId }),
    /** Sends the edit as typed, and puts it away once it lands. */
    commit: async ({ stickyId, text, gif }: SentEdit) => {
      if (!edit || edit.stickyId !== stickyId) return;
      const sent = { stickyId, sent: true as const };
      setEdit(sent);
      const landed = await save({ stickyId, text, gif });
      // Only while it is still the edit: another may have been started since.
      setEdit((current) =>
        current !== sent ? current : landed ? null : { stickyId, unsaved: { text, ...(gif ? { gif } : {}) } }
      );
    },
    /** Closes the editor, its words and any edit still on its way with it. */
    close: () => setEdit(null),
  };
}
