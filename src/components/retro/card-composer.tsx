"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormatPrompt } from "@/convex/model/retroFormats";
import { MAX_CARD_TEXT } from "@/convex/model/retroCards";
import type { Attribution } from "@/convex/model/retro";
import {
  COMPOSER_ANONYMOUS,
  COMPOSER_HIDDEN_ANONYMOUS,
  COMPOSER_HIDDEN_NAMED,
  COMPOSER_PROMPT_LABEL,
  COMPOSER_SUBMIT,
  COMPOSER_TEXT_LABEL,
  COMPOSER_TEXT_PLACEHOLDER,
  COMPOSER_TITLE,
  COMPOSER_VISIBLE,
  postedAs,
} from "@/convex/retroCopy";

interface CardComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompts: readonly FormatPrompt[];
  /** The viewer's display name for the attribution line (ADR-0012, named). */
  viewerName: string;
  /** The retro's attribution; the write-time copy says what the storage supports (ADR-0012). */
  attribution: Attribution;
  /** Whether the shared pointer's entry hides cards right now (ADR-0015). */
  hidden: boolean;
  /** Resolves to whether the card was written; the dialog closes on success. */
  onSubmit: (promptId: string, text: string) => Promise<boolean>;
}

/**
 * The composer (spec §8.1, §19): pick a prompt and read its hint — the one
 * place a hint shows, never on a card or a zone (§6.2) — write, and post.
 * Above the button, the write-time copy: who the card is posted as (or
 * that nobody is), and who can read it now; the two lines stack.
 */
export function CardComposer({ open, onOpenChange, prompts, viewerName, attribution, hidden, onSubmit }: CardComposerProps) {
  const anonymous = attribution === "anonymous";
  const ordered = [...prompts].sort((a, b) => a.order - b.order);
  const [promptId, setPromptId] = useState(ordered[0]?.id ?? "");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  // A prompt removed under the composer falls back to the first.
  const prompt = ordered.find((p) => p.id === promptId) ?? ordered[0];

  const post = async () => {
    if (!prompt || !text.trim() || posting) return;
    setPosting(true);
    const written = await onSubmit(prompt.id, text.trim());
    setPosting(false);
    if (written) {
      setText("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="card-composer">
        <DialogHeader>
          <DialogTitle>{COMPOSER_TITLE}</DialogTitle>
          <DialogDescription data-testid="attribution-copy" data-attribution={attribution}>
            {anonymous ? COMPOSER_ANONYMOUS : postedAs(viewerName)}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="composer-prompt">{COMPOSER_PROMPT_LABEL}</Label>
            <select
              id="composer-prompt"
              value={prompt?.id ?? ""}
              onChange={(e) => setPromptId(e.target.value)}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
            >
              {ordered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {prompt?.hint && (
              <p data-testid="prompt-hint" className="text-xs text-muted-foreground">
                {prompt.hint}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="composer-text">{COMPOSER_TEXT_LABEL}</Label>
            <Textarea
              id="composer-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={COMPOSER_TEXT_PLACEHOLDER}
              maxLength={MAX_CARD_TEXT}
              rows={4}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void post();
                }
              }}
            />
          </div>
          <p data-testid="reveal-copy" data-hidden={String(hidden)} className="text-xs text-muted-foreground">
            {hidden ? (anonymous ? COMPOSER_HIDDEN_ANONYMOUS : COMPOSER_HIDDEN_NAMED) : COMPOSER_VISIBLE}
          </p>
          <DialogFooter>
            <Button type="submit" disabled={!text.trim() || posting}>
              {COMPOSER_SUBMIT}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
