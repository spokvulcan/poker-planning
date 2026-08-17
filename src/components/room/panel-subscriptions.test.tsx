/**
 * Room-side panel subscription guard — the room counterpart of the demo
 * zero-reads guard (demo/zero-reads.test.ts). The docked side panels keep
 * their animated shell mounted while closed, but the panel CONTENT mounts
 * only while the panel is open, so with both panels closed the room must not
 * subscribe any panel query: the issues list/current issue and integration
 * links (IssuesPanel), and the integration connections/mapping
 * (IntegrationSettingsSection inside RoomSettingsPanel).
 *
 * The export read (`issues.getForEnhancedExport`) is probed too: it moved out
 * of the subscribed set into a click-time imperative fetch (useIssuesExport),
 * so it must never appear as a subscription — and the imperative fetch must
 * not fire on render, only when an export is actually invoked.
 *
 * Mechanism mirrors the demo guard: a mocked convex/react records every
 * useQuery call (and the imperative client query), rendered in jsdom via
 * @testing-library/react because the panels are components, not bare hooks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

// Hoisted capture buffers — referenced inside the (hoisted) vi.mock factories.
const spy = vi.hoisted(() => ({
  queries: [] as { query: unknown; args: unknown }[],
  imperativeQueries: [] as unknown[],
}));

vi.mock("convex/react", () => ({
  useQuery: (query: unknown, args: unknown) => {
    spy.queries.push({ query, args });
    return undefined;
  },
  useMutation: () => () => Promise.resolve(undefined),
  useAction: () => () => Promise.resolve(undefined),
  useConvex: () => ({
    query: (query: unknown) => {
      spy.imperativeQueries.push(query);
      return Promise.resolve([]);
    },
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

// Desktop branch of SidePanel — jsdom has no matchMedia.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("@/lib/toast", () => ({
  toast: { success: () => {}, error: () => {} },
}));

// A real room: no demo provider, so the demo signal is false throughout.
vi.mock("./demo/DemoSimulationProvider", () => ({
  useIsDemoMode: () => false,
  useDemoSimulation: () => null,
}));

vi.mock("./room-presence", () => ({
  usePresenceRoster: () => [],
}));

vi.mock("./hooks/useRoomSettingsActions", () => ({
  useRoomSettingsActions: () => ({
    rename: () => Promise.resolve(undefined),
    toggleAutoComplete: () => Promise.resolve(undefined),
    removeUser: () => Promise.resolve(undefined),
    promoteFacilitator: () => Promise.resolve(undefined),
    demoteFacilitator: () => Promise.resolve(undefined),
    transferOwnership: () => Promise.resolve(undefined),
    updatePermissions: () => Promise.resolve(undefined),
  }),
}));

// The accordion decides collapsed-vs-expanded; this guard is about the panel
// gate, so the accordion content is rendered always-mounted to isolate it.
vi.mock("@/components/ui/accordion", () => ({
  Accordion: ({ children }: { children: ReactNode }) => <>{children}</>,
  AccordionItem: ({ children }: { children: ReactNode }) => <>{children}</>,
  AccordionTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  AccordionContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import { IssuesPanel } from "./issues-panel";
import { RoomSettingsPanel } from "./room-settings-panel";

const ROOM_ID = "room-1" as Id<"rooms">;
const ME = "u1" as Id<"users">;

// The export read is click-time only (useIssuesExport) — asserted below to
// never appear as a subscription.
const EXPORT_QUERY = getFunctionName(api.issues.getForEnhancedExport);

function capturedNames(): string[] {
  return spy.queries.map((c) =>
    getFunctionName(c.query as Parameters<typeof getFunctionName>[0]),
  );
}

const roomData = {
  room: {
    _id: ROOM_ID,
    name: "Test Room",
    autoCompleteVoting: false,
    permissions: {
      revealCards: "everyone",
      gameFlow: "everyone",
      issueManagement: "everyone",
      roomSettings: "everyone",
    },
  },
  users: [{ _id: ME, role: "owner" }],
  isOwnerAbsent: false,
} as unknown as RoomWithRelatedData;

function renderIssuesPanel(isOpen: boolean) {
  return render(
    <IssuesPanel
      roomId={ROOM_ID}
      roomName="Test Room"
      isOpen={isOpen}
      onClose={() => {}}
    />,
  );
}

function renderSettingsPanel(isOpen: boolean) {
  return render(
    <RoomSettingsPanel
      roomData={roomData}
      currentUserId={ME}
      isOpen={isOpen}
      onClose={() => {}}
    />,
  );
}

beforeEach(() => {
  spy.queries.length = 0;
  spy.imperativeQueries.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("closed docked panels subscribe nothing", () => {
  it("IssuesPanel closed: no panel query opens, content is not mounted, shell stays", () => {
    const { container } = renderIssuesPanel(false);

    // The animated shell stays mounted (dock layout preserved)…
    expect(container.querySelector("div")).not.toBeNull();
    // …but the subscribing content does not.
    expect(screen.queryByText("Issues")).toBeNull();
    expect(spy.queries).toEqual([]);
    expect(spy.imperativeQueries).toEqual([]);
  });

  it("RoomSettingsPanel closed: the integration section never mounts, so no query opens", () => {
    renderSettingsPanel(false);

    expect(screen.getByTestId("room-settings-panel")).not.toBeNull();
    expect(capturedNames()).toEqual([]);
    expect(spy.imperativeQueries).toEqual([]);
  });
});

describe("open panels subscribe their own set", () => {
  it("IssuesPanel open: subscribes issues + integration links, never the export read", () => {
    renderIssuesPanel(true);

    const names = capturedNames();
    for (const expected of [
      getFunctionName(api.issues.list),
      getFunctionName(api.issues.getCurrent),
      getFunctionName(api.integrations.getRoomMapping),
      getFunctionName(api.integrations.getIssueLinks),
    ]) {
      expect(names).toContain(expected);
    }
    // The export read is click-time only: never subscribed, and the imperative
    // fetch does not fire on render.
    expect(names).not.toContain(EXPORT_QUERY);
    expect(spy.imperativeQueries).toEqual([]);
  });

  it("RoomSettingsPanel open: the integration section mounts and subscribes", () => {
    renderSettingsPanel(true);

    const names = capturedNames();
    expect(names).toContain(getFunctionName(api.integrations.getConnections));
    expect(names).toContain(getFunctionName(api.integrations.getRoomMapping));
  });
});
