/**
 * Room-side panel subscription guard — the room counterpart of the demo
 * zero-reads guard (demo/zero-reads.test.ts). The board's chrome docks the
 * poker room's panels and mounts a panel's content only while it is open, so
 * with both panels closed the room must not subscribe any panel query: the
 * issues list/current issue and integration links (IssuesPanel), and the
 * integration connections/mapping (IntegrationSettingsSection inside
 * RoomSettingsPanel).
 *
 * The export read (`issues.getForEnhancedExport`) is probed too: it moved out
 * of the subscribed set into a click-time imperative fetch (useIssuesExport),
 * so it must never appear as a subscription — and the imperative fetch must
 * not fire on render, only when an export is actually invoked.
 *
 * Mechanism mirrors the demo guard: Convex is the whiteboard's test
 * stand-in, which records every useQuery call (and every imperative client
 * query), rendered in jsdom via @testing-library/react because the panels
 * are components, not bare hooks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { ListTodo, Settings } from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";

vi.mock("convex/react", async (importOriginal) =>
  (await import("@/components/whiteboard/testing/convex")).mockConvexReact(await importOriginal<object>())
);

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

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
import { convex, resetConvex } from "@/components/whiteboard/testing/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RoomWithRelatedData } from "@/convex/model/rooms";
import { BoardChrome, type ChromePanel } from "./board-chrome";
import { IssuesPanel } from "./issues-panel";
import { RoomSettingsPanel } from "./room-settings-panel";

const ROOM_ID = "room-1" as Id<"rooms">;
const ME = "u1" as Id<"users">;

// The export read is click-time only (useIssuesExport) — asserted below to
// never appear as a subscription.
const EXPORT_QUERY = getFunctionName(api.issues.getForEnhancedExport);

function capturedNames(): string[] {
  return convex.reads.map((read) => read.name);
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

// The poker room's two panels, as its board hands them to the chrome.
const PANELS: ChromePanel[] = [
  {
    id: "issues",
    label: "Issues",
    icon: ListTodo,
    render: (close) => <IssuesPanel roomId={ROOM_ID} roomName="Test Room" onClose={close} />,
  },
  {
    id: "settings",
    label: "Room settings",
    icon: Settings,
    testId: "room-settings-panel",
    render: (close) => (
      <RoomSettingsPanel
        roomData={roomData}
        currentUserId={ME}
        onClose={close}
        timeNodes={{ timer: true, sessionTime: false }}
        onSetTimeNodeShown={() => {}}
      />
    ),
  },
];

/** The room's chrome with both panels closed; `open` is a click on a panel's toggle. */
function renderRoomPanels() {
  render(
    <ReactFlowProvider>
      <BoardChrome board={{ name: "Test Room", link: `/room/${ROOM_ID}`, noun: "Room" }} panels={PANELS}>
        <div />
      </BoardChrome>
    </ReactFlowProvider>,
  );
  return { open: (label: string) => fireEvent.click(screen.getByRole("button", { name: label })) };
}

beforeEach(() => {
  resetConvex();
});

afterEach(() => {
  cleanup();
});

describe("closed docked panels subscribe nothing", () => {
  it("with both panels closed, no panel query opens and neither panel's content is mounted", () => {
    renderRoomPanels();

    expect(screen.queryByText("Backlog")).toBeNull();
    expect(screen.queryByTestId("room-settings-panel")).toBeNull();
    expect(convex.reads).toEqual([]);
    expect(convex.fetched).toEqual([]);
  });
});

describe("open panels subscribe their own set", () => {
  it("IssuesPanel open: subscribes issues + integration links, never the export read", () => {
    renderRoomPanels().open("Issues");

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
    expect(convex.fetched).toEqual([]);
  });

  it("RoomSettingsPanel open: the integration section mounts and subscribes", () => {
    renderRoomPanels().open("Room settings");

    const names = capturedNames();
    expect(names).toContain(getFunctionName(api.integrations.getConnections));
    expect(names).toContain(getFunctionName(api.integrations.getRoomMapping));
  });

  it("closing a panel lets go of its subscriptions: nothing it holds renders again", () => {
    const { open } = renderRoomPanels();
    open("Issues");
    open("Issues");
    convex.reads = [];

    open("Room settings");

    expect(capturedNames()).not.toContain(getFunctionName(api.issues.list));
  });
});
