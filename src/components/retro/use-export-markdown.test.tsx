/**
 * useExportMarkdown — one retro as a Markdown file (spec §15.3): reads the
 * export once through the client, hands the browser the file under the
 * name the server chose, and raises the failure copy when the read is
 * refused.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const spy = vi.hoisted(() => ({
  queries: [] as unknown[],
  fail: null as string | null,
  downloads: [] as unknown[][],
  toasts: [] as { kind: string; message: string }[],
}));

vi.mock("convex/react", () => ({
  useConvex: () => ({
    query: async (_ref: unknown, args: unknown) => {
      spy.queries.push(args);
      if (spy.fail) throw new Error(spy.fail);
      return { filename: "Sprint 42.md", content: "# Sprint 42" };
    },
  }),
}));
vi.mock("@/utils/download-file", () => ({
  downloadFile: (...args: unknown[]) => spy.downloads.push(args),
}));
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (message: string) => spy.toasts.push({ kind: "success", message }),
    error: (message: string) => spy.toasts.push({ kind: "error", message }),
  },
}));

import { useExportMarkdown } from "./use-export-markdown";

beforeEach(() => {
  spy.queries = [];
  spy.fail = null;
  spy.downloads = [];
  spy.toasts = [];
});

describe("useExportMarkdown", () => {
  it("reads the export for the room and downloads it as Markdown under the server's file name", async () => {
    const { result } = renderHook(() => useExportMarkdown("room-1" as never));
    await result.current();
    expect(spy.queries).toEqual([{ roomId: "room-1" }]);
    expect(spy.downloads).toEqual([["# Sprint 42", "Sprint 42.md", "text/markdown;charset=utf-8"]]);
    expect(spy.toasts).toEqual([]);
  });

  it("a refused read raises the server's copy and downloads nothing", async () => {
    spy.fail = "You don't have access to this room";
    const { result } = renderHook(() => useExportMarkdown("room-1" as never));
    await result.current();
    expect(spy.downloads).toEqual([]);
    expect(spy.toasts).toEqual([{ kind: "error", message: "You don't have access to this room" }]);
  });
});
