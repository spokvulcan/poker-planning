/**
 * The edit-key hook (ADR-0012, spec §8.1): the client stores and presents
 * keys per room — a key remembered survives a remount, a different room
 * presents none of them, and a forgotten key is gone from storage.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditKeys } from "./use-edit-keys";
import { storageKeyFor } from "./edit-keys";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useEditKeys", () => {
  it("remembers a key under the room, presents it, and reads it back after a remount", () => {
    const { result, unmount } = renderHook(() => useEditKeys("room-1"));
    expect(result.current.keys).toEqual([]);
    act(() => result.current.remember("c1", "key-1"));
    act(() => result.current.remember("c2", "key-2"));
    expect(result.current.keys).toEqual(["key-1", "key-2"]);
    expect(result.current.keyOf("c1")).toBe("key-1");
    expect(result.current.keyOf("zz")).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(storageKeyFor("room-1"))!)).toEqual({ c1: "key-1", c2: "key-2" });
    unmount();

    const again = renderHook(() => useEditKeys("room-1"));
    expect(again.result.current.keys).toEqual(["key-1", "key-2"]);
    expect(again.result.current.keyOf("c2")).toBe("key-2");
  });

  it("keys are per room: another room presents none, and a room change re-reads", () => {
    localStorage.setItem(storageKeyFor("room-1"), JSON.stringify({ c1: "key-1" }));
    const { result, rerender } = renderHook(({ roomId }) => useEditKeys(roomId), {
      initialProps: { roomId: "room-2" },
    });
    expect(result.current.keys).toEqual([]);
    rerender({ roomId: "room-1" });
    expect(result.current.keys).toEqual(["key-1"]);
  });

  it("forget drops the key from state and storage; the presented list is stable while unchanged", () => {
    const { result, rerender } = renderHook(() => useEditKeys("room-1"));
    act(() => result.current.remember("c1", "key-1"));
    const list = result.current.keys;
    rerender();
    expect(result.current.keys).toBe(list);
    act(() => result.current.forget("c1"));
    expect(result.current.keys).toEqual([]);
    expect(localStorage.getItem(storageKeyFor("room-1"))).toBeNull();
  });
});
