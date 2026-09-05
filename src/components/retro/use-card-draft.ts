"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLatest } from "@/hooks/use-latest";

/** The idle window before a text edit is written (spec §10.6). */
export const TEXT_DEBOUNCE_MS = 300;

interface UseCardDraftArgs {
  serverText: string;
  /** The write; keyed single-flight and the optimistic patch are the caller's. */
  onSave: (text: string) => Promise<unknown>;
}

/**
 * A card's text draft (ADR-0022): debounced keystrokes, flush on blur, and
 * never a rollback — a failed save keeps the draft as "Unsaved" and the
 * next keystroke or blur retries it. The server value replaces the draft
 * only while the editor is unfocused, so a facilitator's edit never
 * overwrites what the author is typing.
 */
export function useCardDraft({ serverText, onSave }: UseCardDraftArgs) {
  const [text, setText] = useState(serverText);
  const [unsaved, setUnsaved] = useState(false);
  const [focused, setFocused] = useState(false);
  // The server value the draft last took; a new one replaces the draft
  // while unfocused (derived during render, never in an effect).
  const [taken, setTaken] = useState(serverText);
  if (serverText !== taken) {
    setTaken(serverText);
    if (!focused) setText(serverText);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useLatest(onSave);
  /** The draft as the handlers see it: written on change, synced after a server take. */
  const latestText = useRef(text);
  useEffect(() => {
    latestText.current = text;
  }, [text]);
  /** What the server holds as far as this editor knows; handlers only. */
  const lastSaved = useRef(serverText);
  useEffect(() => {
    if (!focused) lastSaved.current = serverText;
  }, [serverText, focused]);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const flush = useCallback(async () => {
    clearTimer();
    const value = latestText.current;
    if (value === lastSaved.current || !value.trim()) return;
    try {
      await save.current(value);
      lastSaved.current = value;
      setUnsaved(false);
    } catch {
      setUnsaved(true);
    }
  }, [save]);

  const onChange = useCallback(
    (value: string) => {
      setText(value);
      latestText.current = value;
      clearTimer();
      timer.current = setTimeout(() => void flush(), TEXT_DEBOUNCE_MS);
    },
    [flush]
  );

  const onFocus = useCallback(() => setFocused(true), []);

  const onBlur = useCallback(() => {
    setFocused(false);
    void flush();
  }, [flush]);

  useEffect(() => clearTimer, []);

  return { text, unsaved, onChange, onFocus, onBlur };
}
