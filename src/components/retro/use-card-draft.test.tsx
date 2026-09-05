/**
 * Own-card text edits (ADR-0022, spec §10.6, §10.8): a 300 ms idle debounce
 * plus flush on blur; text never rolls back — a failed save keeps the draft
 * with an "Unsaved" state and retries on the next keystroke or blur; an
 * incoming server value replaces the draft only while the editor is
 * unfocused.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCardDraft, TEXT_DEBOUNCE_MS } from "./use-card-draft";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useCardDraft", () => {
  it("debounces keystrokes and saves once after the idle window", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCardDraft({ serverText: "one", onSave: save }));
    act(() => result.current.onFocus());
    act(() => result.current.onChange("tw"));
    act(() => result.current.onChange("two"));
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(TEXT_DEBOUNCE_MS);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("two");
    expect(result.current.unsaved).toBe(false);
  });

  it("flushes on blur without waiting", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCardDraft({ serverText: "one", onSave: save }));
    act(() => result.current.onFocus());
    act(() => result.current.onChange("two"));
    await act(async () => {
      result.current.onBlur();
    });
    expect(save).toHaveBeenCalledWith("two");
  });

  it("keeps the draft and marks it unsaved when the save fails, then retries on the next keystroke", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(undefined);
    const { result } = renderHook(() => useCardDraft({ serverText: "one", onSave: save }));
    act(() => result.current.onFocus());
    act(() => result.current.onChange("two"));
    await act(async () => {
      result.current.onBlur();
    });
    expect(result.current.text).toBe("two");
    expect(result.current.unsaved).toBe(true);

    act(() => result.current.onFocus());
    act(() => result.current.onChange("two!"));
    await act(async () => {
      vi.advanceTimersByTime(TEXT_DEBOUNCE_MS);
    });
    expect(save).toHaveBeenLastCalledWith("two!");
    expect(result.current.unsaved).toBe(false);
  });

  it("takes an incoming server value only while unfocused", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ serverText }) => useCardDraft({ serverText, onSave: save }),
      { initialProps: { serverText: "one" } }
    );
    act(() => result.current.onFocus());
    act(() => result.current.onChange("mine"));
    rerender({ serverText: "theirs" });
    expect(result.current.text).toBe("mine");
    act(() => {
      vi.advanceTimersByTime(TEXT_DEBOUNCE_MS);
    });
    act(() => result.current.onBlur());
    rerender({ serverText: "theirs again" });
    expect(result.current.text).toBe("theirs again");
  });
});
