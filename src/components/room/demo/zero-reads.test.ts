/**
 * Zero-reads guard (Module 4) — the test that proves the cost goal.
 *
 * Reducer unit tests cannot catch a subscription leaking through a hook or
 * component, so this guard renders the demo's canvas hooks inside the
 * DemoSimulationProvider with a mocked Convex client and asserts that none of
 * the demo/canvas/issues/timer/presence subscriptions are opened: every such
 * `useQuery` is passed `"skip"`, and `usePresence` is never called at all.
 * Directly protects user stories 12/14/17 (ADR-0003).
 *
 * It renders with `react-dom/server` (no DOM/jsdom needed): hooks run during
 * render, which is exactly when `useQuery`/`usePresence` are invoked.
 */
import { describe, it, expect, vi } from "vitest";

// Hoisted capture buffers — referenced inside the (hoisted) vi.mock factories.
const spy = vi.hoisted(() => ({
  queries: [] as { query: unknown; args: unknown }[],
  presenceCalled: false,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: unknown, args: unknown) => {
    spy.queries.push({ query, args });
    return undefined; // demo data comes from context, not from Convex
  },
  useMutation: () => async () => undefined,
}));

vi.mock("@convex-dev/presence/react", () => ({
  default: () => {
    spy.presenceCalled = true;
    return undefined;
  },
}));

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import {
  DemoSimulationProvider,
  useDemoSimulation,
} from "./DemoSimulationProvider";
import { useCanvasNodes } from "../hooks/useCanvasNodes";
import { useIssues } from "../hooks/useIssues";
import { useTimerSync } from "../hooks/use-timer-sync";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { DEMO_VIEWER_ID } from "../types";

// Calls every Convex-subscribing hook reachable from the demo canvas.
function Probe(): ReactNode {
  const demo = useDemoSimulation();
  if (!demo) throw new Error("Probe must render inside DemoSimulationProvider");
  const roomId = demo.roomData.room._id;

  useCanvasNodes({
    roomId,
    roomData: demo.roomData,
    currentUserId: undefined,
    selectedCardValue: null,
    isDemoMode: true,
  });
  useIssues({ roomId, isDemoMode: true });
  useRoomPresence(roomId, DEMO_VIEWER_ID, demo.roomData.users);
  useTimerSync({ roomId, nodeId: "timer", userId: undefined });

  return null;
}

describe("zero-reads guard: /demo opens no Convex subscriptions", () => {
  it("skips every demo/canvas/issues/timer query and never subscribes to presence", () => {
    renderToStaticMarkup(
      createElement(DemoSimulationProvider, null, createElement(Probe)),
    );

    // Every subscription reachable from the demo canvas must be bypassed.
    const forbidden = new Set([
      getFunctionName(api.canvas.getCanvasNodes),
      getFunctionName(api.issues.getCurrent),
      getFunctionName(api.issues.list),
      getFunctionName(api.issues.getForEnhancedExport),
      getFunctionName(api.timer.getTimerState),
    ]);

    const leaked = spy.queries
      .map((c) => ({
        name: getFunctionName(c.query as Parameters<typeof getFunctionName>[0]),
        args: c.args,
      }))
      .filter((c) => forbidden.has(c.name) && c.args !== "skip");

    expect(leaked).toEqual([]);
    expect(spy.presenceCalled).toBe(false);
  });
});
