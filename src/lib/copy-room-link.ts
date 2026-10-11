import { toast } from "@/lib/toast";
import { copyTextToClipboard } from "@/utils/copy-text-to-clipboard";
import type { BoardNoun } from "@/components/room/board-chrome";

/**
 * Copies a board's link for the viewer to share, and says so, in the one
 * wording every place that copies it shares: the board's chrome, and a new
 * room or retro, whose link is copied as it opens. `path` is the board's
 * address ("/room/…", or the demo's); `noun` is what the board is called
 * ("Room", "Retro", "Demo"). Resolves to whether the link was copied.
 */
export async function copyRoomLink(path: string, noun: BoardNoun): Promise<boolean> {
  const copied = await copyTextToClipboard(`${window.location.origin}${path}`);
  if (copied) {
    toast.success(`${noun} link copied`, {
      description: `Share it to bring your team into the ${noun.toLowerCase()}.`,
    });
  } else {
    toast.error("Couldn't copy the link", {
      description: "Copy it from your browser's address bar.",
    });
  }
  return copied;
}
