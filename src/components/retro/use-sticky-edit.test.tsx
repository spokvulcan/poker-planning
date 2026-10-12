/**
 * The sticky being edited. Once sent, the edit is kept with what it says
 * until it lands, so a refused one ("Only its author can change this
 * sticky.") opens the editor again on the words as typed; an edit that lands
 * closes the editor, and leaves alone an edit started since.
 */
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { Gif } from "@/convex/model/retro";
import { useStickyEdit } from "./use-sticky-edit";

const S1 = "s1" as Id<"retroStickies">;
const S2 = "s2" as Id<"retroStickies">;
const gif: Gif = { url: "https://media.giphy.com/media/abc/giphy.gif", width: 200, height: 150, title: "This is fine" };

/** Edits stickies whose saves land or are refused when the test says so. */
function editing() {
  const pending: ((landed: boolean) => void)[] = [];
  const save = vi.fn((_edit: unknown) => new Promise<boolean>((resolve) => pending.push(resolve)));
  const { result } = renderHook(() => useStickyEdit(save));
  return {
    result,
    save,
    start: (stickyId: Id<"retroStickies">) => act(() => result.current.start(stickyId)),
    commit: (stickyId: Id<"retroStickies">, text: string, withGif: Gif | null = null) =>
      act(() => void result.current.commit({ stickyId, text, gif: withGif })),
    settle: (landed: boolean) => act(async () => pending.shift()?.(landed)),
  };
}

describe("useStickyEdit", () => {
  it("closes the editor while the edit is on its way", () => {
    const { result, save, start, commit } = editing();
    start(S1);
    expect(result.current.editing).toEqual({ stickyId: S1 });

    commit(S1, "Standups run longer", gif);

    expect(save).toHaveBeenCalledWith({ stickyId: S1, text: "Standups run longer", gif });
    expect(result.current.editing).toBeNull();
  });

  it("opens the editor again on a refused edit's words", async () => {
    const { result, start, commit, settle } = editing();
    start(S1);

    commit(S1, "Standups run longer", gif);
    await settle(false);

    expect(result.current.editing).toEqual({ stickyId: S1, unsaved: { text: "Standups run longer", gif } });
  });

  it("puts the edit away once it lands", async () => {
    const { result, start, commit, settle } = editing();
    start(S1);

    commit(S1, "Standups run longer");
    await settle(true);

    expect(result.current.editing).toBeNull();
  });

  it("leaves an edit started since alone when an earlier one is refused", async () => {
    const { result, start, commit, settle } = editing();
    start(S1);
    commit(S1, "Standups run longer");

    start(S2);
    await settle(false);

    expect(result.current.editing).toEqual({ stickyId: S2 });
  });
});
