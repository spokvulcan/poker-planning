import { useCallback } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { downloadFile } from "@/utils/download-file";
import { toast } from "@/lib/toast";
import { EXPORT_MARKDOWN_FAILED } from "@/convex/retroCopy";

/**
 * One retro as Markdown (spec §15.3): a one-shot read of `retro.exportMarkdown`
 * (no subscription: the file is a moment, not a view) handed to the
 * browser as a download under the name the server chose. Anyone with room
 * access may take one; the server's projections decide what is in it.
 */
export function useExportMarkdown(roomId: Id<"rooms">): () => Promise<void> {
  const convex = useConvex();
  return useCallback(async () => {
    try {
      const { filename, content } = await convex.query(api.retro.exportMarkdown, { roomId });
      downloadFile(content, filename, "text/markdown;charset=utf-8");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : EXPORT_MARKDOWN_FAILED);
    }
  }, [convex, roomId]);
}
