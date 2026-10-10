/**
 * The sticky being written. Once sent, its draft is kept with what it says
 * until the sticky lands, so a refused one ("This board is full.") comes back
 * as it was written; a sticky that lands puts away its own draft and no other.
 */
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Gif } from "@/convex/model/retro";
import { useStickyDraft } from "./use-sticky-draft";

const gif: Gif = { url: "https://media.giphy.com/media/abc/giphy.gif", width: 200, height: 150, title: "This is fine" };

/** Writes a sticky whose add lands or is refused when the test says so. */
function writing() {
  const pending: ((landed: boolean) => void)[] = [];
  const add = vi.fn((_sticky: unknown) => new Promise<boolean>((resolve) => pending.push(resolve)));
  const { result } = renderHook(() => useStickyDraft(add));
  return {
    result,
    add,
    start: (columnId = "c1") => {
      act(() => result.current.start(columnId, { x: 10, y: 20 }));
      return result.current.draft!.clientId;
    },
    commit: (clientId: string, text: string, withGif?: Gif) =>
      act(() => void result.current.commit(clientId, text, withGif)),
    settle: (landed: boolean) => act(async () => pending.shift()?.(landed)),
  };
}

describe("useStickyDraft", () => {
  it("keeps a refused sticky's draft, as it was written", async () => {
    const { result, add, start, commit, settle } = writing();
    const clientId = start("c2");
    const written = { clientId, columnId: "c2", position: { x: 10, y: 20 }, text: "Standups run long", gif };

    commit(clientId, "Standups run long", gif);
    expect(add).toHaveBeenCalledWith(written);
    await settle(false);

    expect(result.current.draft).toEqual(written);
  });

  it("puts the draft away once its sticky lands", async () => {
    const { result, start, commit, settle } = writing();

    commit(start(), "Standups run long");
    expect(result.current.draft?.text).toBe("Standups run long");
    await settle(true);

    expect(result.current.draft).toBeNull();
  });

  it("leaves a newer draft open when an earlier sticky lands", async () => {
    const { result, start, commit, settle } = writing();

    commit(start(), "Standups run long");
    const next = start();
    await settle(true);

    expect(result.current.draft?.clientId).toBe(next);
  });
});
