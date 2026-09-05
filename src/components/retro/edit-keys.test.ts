/**
 * The edit-key store (ADR-0012, spec §8.1): keys are kept per room, read
 * back defensively, and a storage that throws never breaks the board.
 */
import { describe, it, expect } from "vitest";
import {
  readEditKeys,
  storageKeyFor,
  withEditKey,
  withoutEditKey,
  writeEditKeys,
  type KeyStorage,
} from "./edit-keys";

function memoryStorage(): KeyStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("edit keys", () => {
  it("round-trips per room and removes the entry when the last key goes", () => {
    const storage = memoryStorage();
    writeEditKeys(storage, "room-1", { a: "key-a", b: "key-b" });
    writeEditKeys(storage, "room-2", { c: "key-c" });
    expect(readEditKeys(storage, "room-1")).toEqual({ a: "key-a", b: "key-b" });
    expect(readEditKeys(storage, "room-2")).toEqual({ c: "key-c" });
    expect(readEditKeys(storage, "room-3")).toEqual({});

    writeEditKeys(storage, "room-2", {});
    expect(storage.data.has(storageKeyFor("room-2"))).toBe(false);
  });

  it("ignores garbage and non-string values, and tolerates a storage that throws or is absent", () => {
    const storage = memoryStorage();
    storage.setItem(storageKeyFor("r"), "{not json");
    expect(readEditKeys(storage, "r")).toEqual({});
    storage.setItem(storageKeyFor("r"), JSON.stringify({ a: 1, b: "", c: "ok" }));
    expect(readEditKeys(storage, "r")).toEqual({ c: "ok" });
    storage.setItem(storageKeyFor("r"), JSON.stringify(["x"]));
    expect(readEditKeys(storage, "r")).toEqual({});

    const throwing: KeyStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(readEditKeys(throwing, "r")).toEqual({});
    expect(() => writeEditKeys(throwing, "r", { a: "k" })).not.toThrow();
    expect(readEditKeys(undefined, "r")).toEqual({});
    expect(() => writeEditKeys(undefined, "r", { a: "k" })).not.toThrow();
  });

  it("remember and forget are pure and keep identity when nothing changes", () => {
    const keys = { a: "key-a" };
    expect(withEditKey(keys, "a", "key-a")).toBe(keys);
    expect(withEditKey(keys, "b", "key-b")).toEqual({ a: "key-a", b: "key-b" });
    expect(withoutEditKey(keys, "zz")).toBe(keys);
    expect(withoutEditKey(keys, "a")).toEqual({});
  });
});
