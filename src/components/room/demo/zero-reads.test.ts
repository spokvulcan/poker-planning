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
 * Single-channel sourcing (#214): the demo signal travels only through the
 * provider seam — the hooks take no `isDemoMode` prop and derive it from
 * context. So this guard renders them with NO `isDemoMode` prop and asserts the
 * bypass purely from being inside the provider; a companion case renders the
 * same hooks OUTSIDE the provider and asserts they behave as a real room (every
 * subscription opens). Together they pin that the signal and the Convex-bypass
 * branch on the same fact.
 *
 * It renders with `react-dom/server` (no DOM/jsdom needed): hooks run during
 * render, which is exactly when `useQuery`/`usePresence` are invoked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import {
  DemoSimulationProvider,
  useDemoSimulation,
} from "./DemoSimulationProvider";
import { useCanvasNodes } from "../hooks/useCanvasNodes";
import { useIssues } from "../hooks/useIssues";
import { useTimerSync } from "../hooks/use-timer-sync";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { DEMO_VIEWER_ID } from "../types";

// Every subscription reachable from the demo canvas. In demo mode all must be
// bypassed; in a real room all must open.
const SUBSCRIPTIONS = [
  getFunctionName(api.canvas.getCanvasNodes),
  getFunctionName(api.issues.getCurrent),
  getFunctionName(api.issues.list),
  getFunctionName(api.issues.getForEnhancedExport),
  getFunctionName(api.timer.getTimerState),
];

// Names + args of the captured subscription calls (ignoring queries we don't
// guard here, e.g. the integration queries owned by their own sites).
function capturedSubscriptions(): { name: string; args: unknown }[] {
  return spy.queries
    .map((c) => ({
      name: getFunctionName(c.query as Parameters<typeof getFunctionName>[0]),
      args: c.args,
    }))
    .filter((c) => SUBSCRIPTIONS.includes(c.name));
}

// Calls every always-mounted Convex-subscribing hook reachable from the demo
// canvas. The other demo-reachable subscriptions are guarded at their own site,
// so they are deliberately outside this Probe's scope (audited 2026-05-24):
//   - RoomCanvas/PlayerNode/StoryNode read `roomData` (a prop) — api.rooms.get
//     is never called in demo mode.
//   - issues-panel skips its integration queries in demo (derives the signal
//     from `useIsDemoMode()`).
//   - integration-settings (getConnections/getRoomMapping, both un-skipped) only
//     mounts behind `{!isDemoMode && …}` in room-settings-panel.
// If one of those gates regresses this Probe won't catch it — re-audit on change.
function useProbeHooks(roomId: Id<"rooms">, roomData: RoomWithRelatedData): void {
  // The hooks take no `isDemoMode` prop: they read the demo signal from the
  // provider seam, so what differs between the two cases is only whether the
  // provider is mounted around them.
  useCanvasNodes({
    roomId,
    roomData,
    currentUserId: undefined,
    selectedCardValue: null,
  });
  useIssues({ roomId });
  useRoomPresence(roomId, DEMO_VIEWER_ID, roomData.users);
  useTimerSync({ roomId, nodeId: "timer", userId: undefined });
}

function DemoProbe(): ReactNode {
  const demo = useDemoSimulation();
  if (!demo) throw new Error("DemoProbe must render inside DemoSimulationProvider");
  useProbeHooks(demo.roomData.room._id, demo.roomData);
  return null;
}

// A real room: no provider mounted, so `useDemoSimulation()` is null and the
// hooks must subscribe. The exact data is irrelevant — the queries fire during
// render regardless — so a minimal room shape is enough.
function RealRoomProbe(): ReactNode {
  const roomId = "real-room-id" as Id<"rooms">;
  const roomData = {
    room: { _id: roomId, name: "Real Room", isGameOver: false },
    users: [],
    votes: [],
    isOwnerAbsent: false,
  } as unknown as RoomWithRelatedData;
  useProbeHooks(roomId, roomData);
  return null;
}

describe("zero-reads guard: the demo signal is sourced from the provider seam", () => {
  beforeEach(() => {
    spy.queries.length = 0;
    spy.presenceCalled = false;
  });

  it("skips every demo/canvas/issues/timer query and never subscribes to presence inside the provider", () => {
    renderToStaticMarkup(
      createElement(DemoSimulationProvider, null, createElement(DemoProbe)),
    );

    // Every subscription reachable from the demo canvas must be bypassed.
    const leaked = capturedSubscriptions().filter((c) => c.args !== "skip");
    expect(leaked).toEqual([]);
    expect(spy.presenceCalled).toBe(false);
  });

  it("opens every subscription and subscribes to presence outside the provider (real room)", () => {
    renderToStaticMarkup(createElement(RealRoomProbe));

    const opened = capturedSubscriptions();
    // Each guarded subscription opened at least once with real args (not skip).
    for (const name of SUBSCRIPTIONS) {
      const calls = opened.filter((c) => c.name === name);
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((c) => c.args !== "skip")).toBe(true);
    }
    expect(spy.presenceCalled).toBe(true);
  });
});
