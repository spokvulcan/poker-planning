/**
 * Zero-reads guard (Module 4) — the test that proves the cost goal.
 *
 * Reducer unit tests cannot catch a subscription leaking through a hook or
 * component, so this guard renders the demo's canvas hooks inside the
 * DemoSimulationProvider with a mocked Convex client and asserts that none of
 * the demo/canvas/issues/presence subscriptions are opened: every such
 * `useQuery` is passed `"skip"`, and `usePresence` is never called at all.
 * (The timer opens no subscription at all anymore — its state arrives with the
 * canvas node data — so it is probed for regressions but lists no query.)
 * Directly protects user stories 12/14/17 (ADR-0003).
 *
 * The shell is covered too: AuthProvider subscribes `api.users.getGlobalUser`
 * whenever a session is live, on any route, so what keeps it off the demo is
 * the shell: /demo's route group mounts no AuthProvider. The probe renders the
 * real demo shell (the (demo) layout) over the demo tree with a live session
 * and asserts nothing subscribes and the session is never read; AuthProvider,
 * which the app shell mounts, opens the subscription for the same session.
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
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Hoisted capture buffers — referenced inside the (hoisted) vi.mock factories.
const spy = vi.hoisted(() => {
  // The demo shell builds its Convex client from it when it loads.
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://zero-reads-123.convex.cloud");
  return {
    queries: [] as { query: unknown; args: unknown }[],
    presenceCalled: false,
    sessionReads: 0,
  };
});

vi.mock("convex/react", async (importOriginal) => ({
  // The real client and provider, which the demo shell mounts.
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (query: unknown, args: unknown) => {
    spy.queries.push({ query, args });
    return undefined; // demo data comes from context, not from Convex
  },
  useMutation: () => async () => undefined,
  // A live session, so the AuthProvider probe exercises the authenticated case.
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("@convex-dev/presence/react", () => ({
  default: () => {
    spy.presenceCalled = true;
    return undefined;
  },
}));

// AuthProvider's probe runs on the demo's own route, which must not matter.
vi.mock("next/navigation", () => ({
  usePathname: () => "/demo",
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    // A live session, which the demo shell must never read.
    useSession: () => {
      spy.sessionReads += 1;
      return { data: { user: { id: "user-1", isAnonymous: false, email: "u@example.com" } } };
    },
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
import { AuthProvider } from "@/components/auth/auth-provider";
import { useCanvasNodes } from "../hooks/useCanvasNodes";
import { useIssues } from "../hooks/useIssues";
import { useTimerSync } from "../hooks/use-timer-sync";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { DEMO_VIEWER_ID } from "../types";
import DemoLayout from "@/app/(demo)/layout";

// Every subscription reachable from the demo canvas. In demo mode all must be
// bypassed; in a real room all must open. `api.issues.getForEnhancedExport`
// is deliberately absent: the export flow fetches it imperatively at click
// time (useIssuesExport), so no component ever subscribes it.
const SUBSCRIPTIONS = [
  getFunctionName(api.canvas.getCanvasNodes),
  getFunctionName(api.issues.getCurrent),
  getFunctionName(api.issues.list),
];

// The subscription the app shell mounts above every page (AuthProvider). The
// shell, not the provider seam, keeps it off the demo, so it gets its own
// probe below.
const ROOT_SUBSCRIPTIONS = [getFunctionName(api.users.getGlobalUser)];

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

// Same, for the root AuthProvider subscription.
function capturedRootSubscriptions(): { name: string; args: unknown }[] {
  return spy.queries
    .map((c) => ({
      name: getFunctionName(c.query as Parameters<typeof getFunctionName>[0]),
      args: c.args,
    }))
    .filter((c) => ROOT_SUBSCRIPTIONS.includes(c.name));
}

// Calls every always-mounted Convex-subscribing hook reachable from the demo
// canvas. The other demo-reachable subscriptions are guarded at their own site,
// so they are deliberately outside this Probe's scope (audited 2026-08-03):
//   - RoomCanvas/PlayerNode read `roomData` (a prop) — api.rooms.get
//     is never called in demo mode.
//   - issues-panel skips its integration queries in demo (derives the signal
//     from `useIsDemoMode()`); its writes go through useIssueActions, which
//     no-ops in demo (covered by useIssueActions.test.tsx). Its export flow
//     fetches imperatively (useIssuesExport) and the control is disabled in
//     demo, so it opens no subscription either.
//   - integration-settings (getConnections/getRoomMapping, both un-skipped) only
//     mounts behind `{!isDemoMode && …}` in room-settings-panel, and only while
//     the settings panel is open.
// If one of those gates regresses this Probe won't catch it — re-audit on change.
// A stopped persisted timer, as a freshly created canvas node delivers it.
// useTimerSync opens no subscription in either mode — it is probed so a
// regression that reintroduces one fails the leak assertion above.
const STOPPED_TIMER_STATE = {
  startedAt: null,
  pausedAt: null,
  elapsedSeconds: 0,
  isRunning: false,
  lastAction: null,
};

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
  useTimerSync({
    roomId,
    nodeId: "timer",
    userId: undefined,
    timerState: STOPPED_TIMER_STATE,
  });
}

function DemoProbe(): ReactNode {
  const demo = useDemoSimulation();
  if (!demo) throw new Error("DemoProbe must render inside DemoSimulationProvider");
  useProbeHooks(demo.roomData.room._id, demo.roomData);
  return null;
}

// A real room: no provider mounted, so `useDemoSimulation()` is null and the
// hooks must subscribe. The exact data is irrelevant — `useQuery` fires
// synchronously during `renderToStaticMarkup`, before any data round-trip — so
// the double-cast to a minimal room shape is safe: nothing ever reads the
// fields we omitted.
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

  it("skips every demo/canvas/issues query and never subscribes to presence inside the provider", () => {
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

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("zero-reads guard: the demo shell mounts no auth", () => {
  beforeEach(() => {
    spy.queries.length = 0;
    spy.presenceCalled = false;
    spy.sessionReads = 0;
  });

  it("opens no subscription and never reads the session, even with one live", () => {
    renderToStaticMarkup(
      createElement(
        DemoLayout,
        null,
        createElement(DemoSimulationProvider, null, createElement(DemoProbe)),
      ),
    );

    // The demo tree rendered inside the shell and reached its subscriptions...
    expect(capturedSubscriptions().length).toBeGreaterThan(0);
    // ...and nothing under the shell subscribed.
    expect(spy.queries.filter((c) => c.args !== "skip")).toEqual([]);
    expect(spy.sessionReads).toBe(0);
  });

  it("AuthProvider, which only the app shell mounts, opens getGlobalUser for a live session on any route", () => {
    renderToStaticMarkup(
      createElement(AuthProvider, null, createElement(RealRoomProbe)),
    );

    const opened = capturedRootSubscriptions();
    expect(opened.length).toBeGreaterThan(0);
    expect(opened.every((c) => c.args !== "skip")).toBe(true);
  });
});
