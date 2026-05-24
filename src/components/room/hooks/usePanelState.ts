"use client";

import { useCallback, useEffect, useState } from "react";

interface UsePanelStateReturn {
  isIssuesPanelOpen: boolean;
  isSettingsOpen: boolean;
  openIssues: () => void;
  openSettings: () => void;
  closeAll: () => void;
}

/**
 * Owns the two docked-panel booleans and the rules that bind them:
 *   - opening one panel closes the other (only one is ever open);
 *   - Escape closes an open panel, except while a field edit is in progress
 *     (focus in an input/textarea/contenteditable) or a dialog/alertdialog is
 *     layered over the panel (which handles its own Escape).
 *
 * The mobile Sheet handles Escape natively; this listener only covers the
 * desktop docked panels, which are plain elements, so it is only attached while
 * a panel is open.
 */
export function usePanelState(): UsePanelStateReturn {
  const [isIssuesPanelOpen, setIsIssuesPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const openIssues = useCallback(() => {
    setIsSettingsOpen(false);
    setIsIssuesPanelOpen(true);
  }, []);

  const openSettings = useCallback(() => {
    setIsIssuesPanelOpen(false);
    setIsSettingsOpen(true);
  }, []);

  const closeAll = useCallback(() => {
    setIsIssuesPanelOpen(false);
    setIsSettingsOpen(false);
  }, []);

  useEffect(() => {
    if (!isSettingsOpen && !isIssuesPanelOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      // Let Escape commit/cancel the field edit (e.g. the Room Name input)
      // instead of tearing down the whole panel and discarding the edit.
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;

      // A Base UI dialog layered over the panel (e.g. the remove-user confirm)
      // handles its own Escape. Don't also collapse the panel underneath it.
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;

      closeAll();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsOpen, isIssuesPanelOpen, closeAll]);

  return {
    isIssuesPanelOpen,
    isSettingsOpen,
    openIssues,
    openSettings,
    closeAll,
  };
}
