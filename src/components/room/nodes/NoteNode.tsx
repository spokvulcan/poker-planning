"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { StickyNote, X } from "lucide-react";
import { ReactElement, memo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { NoteNodeType } from "../types";

// Debounce delay for auto-save (ms)
const DEBOUNCE_DELAY = 500;

/**
 * Where `index` in `before` lands in `after`, treating the difference as one
 * contiguous edit: an index ahead of the edit stays put, one past it keeps
 * its distance from the end.
 */
function rebaseIndex(before: string, after: string, index: number): number {
  const shorter = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shorter && before[prefix] === after[prefix]) prefix++;
  if (index <= prefix) return index;
  return Math.max(prefix, after.length - (before.length - index));
}

export const NoteNode = memo(
  ({ data, selected }: NodeProps<NoteNodeType>): ReactElement => {
    const { issueTitle, content, lastUpdatedBy, lastUpdatedAt, onUpdateContent, onDelete } = data;

    // Local state for textarea content
    const [localContent, setLocalContent] = useState(content);
    // The server text the textarea last took in. Only a change to it is an
    // edit to take in (a demo note's never changes, so typing there sticks).
    const [syncedContent, setSyncedContent] = useState(content);
    // From the first keystroke until the last save has landed.
    const [isSaving, setIsSaving] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Track pending content for cleanup flush
    const pendingContentRef = useRef<string | null>(null);
    const savesInFlightRef = useRef(0);
    const selectionAfterSyncRef = useRef<[number, number] | null>(null);
    const onUpdateContentRef = useRef(onUpdateContent);

    // Take in the server's text (another user's edit, or the echo of our own
    // save) only while nothing typed here is unsaved. Until then the local
    // text wins: resetting it would drop what is being typed and move the
    // caret, and the pending save overwrites the server's text anyway.
    useEffect(() => {
      if (isSaving || content === syncedContent) return;
      setSyncedContent(content);
      if (content === localContent) return;
      const textarea = textareaRef.current;
      if (textarea && textarea === document.activeElement) {
        selectionAfterSyncRef.current = [
          rebaseIndex(localContent, content, textarea.selectionStart),
          rebaseIndex(localContent, content, textarea.selectionEnd),
        ];
      }
      setLocalContent(content);
    }, [content, syncedContent, isSaving, localContent]);

    // Keep the caret next to the text it was next to before a remote edit.
    useLayoutEffect(() => {
      const selection = selectionAfterSyncRef.current;
      if (!selection) return;
      selectionAfterSyncRef.current = null;
      textareaRef.current?.setSelectionRange(...selection);
    }, [localContent]);

    // Keep ref updated for cleanup
    useEffect(() => {
      onUpdateContentRef.current = onUpdateContent;
    }, [onUpdateContent]);

    // Format the "last edited" time
    const formatLastEdited = useCallback(() => {
      if (!lastUpdatedAt) return null;
      const now = Date.now();
      const diff = now - lastUpdatedAt;
      const minutes = Math.floor(diff / 60000);

      if (minutes < 1) return "just now";
      if (minutes === 1) return "1 min ago";
      if (minutes < 60) return `${minutes} mins ago`;

      const hours = Math.floor(minutes / 60);
      if (hours === 1) return "1 hour ago";
      if (hours < 24) return `${hours} hours ago`;

      return "over a day ago";
    }, [lastUpdatedAt]);

    // Convex resolves a mutation only once query results that include it have
    // arrived, so when the last save settles the server's text is current.
    const save = useCallback(async (value: string) => {
      savesInFlightRef.current += 1;
      try {
        await onUpdateContentRef.current(value);
      } finally {
        savesInFlightRef.current -= 1;
        if (savesInFlightRef.current === 0 && pendingContentRef.current === null) {
          setIsSaving(false);
        }
      }
    }, []);

    // Debounced save handler
    const handleContentChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value;
        setLocalContent(newContent);
        setIsSaving(true);
        pendingContentRef.current = newContent;

        // Clear existing timer
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        // Set new timer
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          pendingContentRef.current = null;
          void save(newContent);
        }, DEBOUNCE_DELAY);
      },
      [save]
    );

    // Cleanup timer on unmount - flush pending saves
    // NOTE: This calls an async mutation but doesn't await it. If the component
    // unmounts during rapid navigation, the save may not complete. This is an
    // acceptable trade-off since the 500ms debounce means users typically pause
    // longer than that before switching issues, making data loss unlikely.
    useEffect(() => {
      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          // Flush pending content before unmount
          if (pendingContentRef.current !== null) {
            void onUpdateContentRef.current(pendingContentRef.current);
          }
        }
      };
    }, []);

    return (
      <div className="relative">
        {/* Handle on left side for edge connection from session */}
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          className="bg-amber-400! dark:bg-amber-600!"
          aria-hidden="true"
        />

        <div
          className={cn(
            "w-[280px] rounded-lg shadow-lg border-2 transition-all",
            "bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700",
            selected && "ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-surface-1"
          )}
          role="article"
          aria-label={`Discussion note for ${issueTitle}`}
        >
          {/* Header with issue title */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200 dark:border-amber-700/50">
            <StickyNote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-medium text-amber-800 dark:text-amber-300 truncate flex-1">
              {issueTitle}
            </span>
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-amber-600 dark:text-amber-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                aria-label="Delete note"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Content textarea */}
          <div className="p-3">
            <Textarea
              ref={textareaRef}
              value={localContent}
              onChange={handleContentChange}
              placeholder="Add discussion notes, rationale, risks..."
              className={cn(
                "min-h-[100px] resize-none text-sm",
                "bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-amber-400 dark:placeholder:text-amber-600",
                "text-amber-900 dark:text-amber-100"
              )}
              aria-label="Discussion notes"
            />
          </div>

          {/* Footer with last edited info */}
          <div className="px-3 py-2 border-t border-amber-200 dark:border-amber-700/50 flex items-center justify-between">
            <span className="text-xs text-amber-600 dark:text-amber-500">
              {lastUpdatedBy && (
                <>
                  <span className="font-medium">{lastUpdatedBy}</span>
                  {lastUpdatedAt && ` \u00B7 ${formatLastEdited()}`}
                </>
              )}
            </span>
            {isSaving && (
              <span className="text-xs text-amber-500 dark:text-amber-400 animate-pulse">
                Saving...
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
);

NoteNode.displayName = "NoteNode";
