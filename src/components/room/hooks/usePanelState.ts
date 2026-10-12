"use client";

import { useCallback, useEffect, useState } from "react";

interface UsePanelStateReturn {
  /** The panel that is open, by its id, or null. */
  openId: string | null;
  open: (id: string) => void;
  /** Opens a panel, or closes it if it is the one open. */
  toggle: (id: string) => void;
  close: () => void;
}

/**
 * Which of a board's docked panels is open, and the rules that bind them:
 *   - only one is ever open: opening one closes the other;
 *   - Escape closes an open panel, except while a field edit is in progress
 *     (focus in an input/textarea/contenteditable) or a dialog/alertdialog is
 *     layered over the panel (which handles its own Escape).
 *
 * The board's chrome holds it. The mobile Sheet handles Escape natively; this
 * listener only covers the desktop docked panel, which is a plain element, so
 * it is only attached while a panel is open.
 */
export function usePanelState(): UsePanelStateReturn {
  const [openId, setOpenId] = useState<string | null>(null);

  const open = useCallback((id: string) => setOpenId(id), []);
  const toggle = useCallback((id: string) => setOpenId((current) => (current === id ? null : id)), []);
  const close = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    if (openId === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      // Let Escape commit/cancel the field edit (e.g. the Room Name input)
      // instead of tearing down the whole panel and discarding the edit.
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;

      // A Base UI dialog layered over the panel (e.g. the remove-user confirm)
      // handles its own Escape. Don't also collapse the panel underneath it.
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;

      close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openId, close]);

  return { openId, open, toggle, close };
}
