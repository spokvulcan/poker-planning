/**
 * The Overview subscribes to one read, analytics.getDashboard, and every
 * panel shows its part of it: the header numbers, time to consensus, the
 * voters and the session list. Until the read lands, the panels show their
 * skeletons and no number at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { ReactNode } from "react";

const spy = vi.hoisted(() => ({
  queries: [] as { query: unknown; args: unknown }[],
  result: undefined as unknown,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: unknown, args: unknown) => {
    spy.queries.push({ query, args });
    return args === "skip" ? undefined : spy.result;
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {} }) }));

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

// The sidebar's desktop branch: jsdom has no matchMedia.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { getFunctionName } from "convex/server";
import type { Dashboard } from "@/convex/analyticsMath";
import { EMPTY_DASHBOARD } from "@/convex/analyticsMath";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DateRangeProvider } from "@/components/dashboard/date-range-context";
import { DashboardContent } from "./dashboard-content";

const DASHBOARD: Dashboard = {
  ...EMPTY_DASHBOARD,
  summary: {
    totalSessions: 3,
    totalIssuesEstimated: 17,
    totalStoryPoints: 55,
    averageAgreement: 84,
  },
  sessions: [
    {
      roomId: "room-1",
      roomName: "Sprint 42 planning",
      joinedAt: Date.UTC(2026, 9, 1),
      lastActivityAt: Date.UTC(2026, 9, 2),
      issuesCompleted: 9,
      totalStoryPoints: 21,
      averageAgreement: 90,
      participantCount: 5,
    },
  ],
  timeToConsensus: {
    averageMs: 90_000,
    medianMs: 60_000,
    outliers: [],
    trendBySession: [],
    trend: { direction: "stable", changePct: null },
  },
  voterAlignment: {
    users: [
      {
        userId: "u-ada",
        userName: "Ada Lovelace",
        totalVotes: 7,
        agreesWithConsensus: 6,
        agreementRate: 86,
        averageDelta: 0,
        tendency: "aligned",
      },
    ],
    scatterPoints: [],
  },
};

function renderOverview() {
  return render(
    <DateRangeProvider>
      <SidebarProvider>
        <DashboardContent />
      </SidebarProvider>
    </DateRangeProvider>
  );
}

/** Queries within the panel card titled `title`. */
function card(title: string) {
  return within(screen.getByText(title).closest("[data-slot=card]") as HTMLElement);
}

function subscribedQueries(): string[] {
  return [
    ...new Set(
      spy.queries.map((c) =>
        getFunctionName(c.query as Parameters<typeof getFunctionName>[0])
      )
    ),
  ];
}

beforeEach(() => {
  spy.queries = [];
  spy.result = undefined;
  // Recharts measures its container; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DashboardContent", () => {
  it("makes one subscription, to the dashboard read over all time", () => {
    spy.result = DASHBOARD;
    renderOverview();

    expect(subscribedQueries()).toEqual(["analytics:getDashboard"]);
    for (const { args } of spy.queries) expect(args).toEqual({ dateRange: undefined });
  });

  it("shows the read's numbers in its panels", () => {
    spy.result = DASHBOARD;
    renderOverview();

    expect(card("Total Sessions").getByText("3")).toBeTruthy();
    expect(card("Issues Estimated").getByText("17")).toBeTruthy();
    expect(card("Story Points").getByText("55")).toBeTruthy();
    expect(card("Avg Agreement").getByText("84%")).toBeTruthy();
    expect(card("Avg Time to Consensus").getByText("1m 30s")).toBeTruthy();
    expect(card("Individual Voting Stats").getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Sprint 42 planning")).toBeTruthy();
  });

  it("states the read's trend verdicts, not verdicts of its own", () => {
    spy.result = {
      ...DASHBOARD,
      agreementChart: {
        // The points climb day by day; the verdict is the read's, room against room.
        points: [
          { date: "2026-10-01", timestamp: Date.UTC(2026, 9, 1), agreement: 40, issueTitle: "Login", roomName: "Sprint 42 planning" },
          { date: "2026-10-02", timestamp: Date.UTC(2026, 9, 2), agreement: 90, issueTitle: "Logout", roomName: "Sprint 43 planning" },
        ],
        trend: { direction: "declining", changePct: -12 },
      },
      timeToConsensus: {
        ...DASHBOARD.timeToConsensus,
        trend: { direction: "faster", changePct: -25 },
      },
    } satisfies Dashboard;
    renderOverview();

    expect(card("Agreement Trend").getByText("Trending down 12%")).toBeTruthy();
    expect(card("Avg Time to Consensus").getByText("25% faster")).toBeTruthy();
  });

  it("claims no size the read didn't state", () => {
    spy.result = {
      ...DASHBOARD,
      agreementChart: {
        points: [
          { date: "2026-10-01", timestamp: Date.UTC(2026, 9, 1), agreement: 40, issueTitle: "Login", roomName: "Sprint 42 planning" },
          { date: "2026-10-02", timestamp: Date.UTC(2026, 9, 2), agreement: 90, issueTitle: "Logout", roomName: "Sprint 42 planning" },
        ],
        // One room: nothing to compare.
        trend: { direction: "stable", changePct: null },
      },
      timeToConsensus: {
        ...DASHBOARD.timeToConsensus,
        // Slower than sessions that took no time: no percentage to state.
        trend: { direction: "slower", changePct: null },
      },
    } satisfies Dashboard;
    renderOverview();

    expect(card("Agreement Trend").getByText("Team alignment over time")).toBeTruthy();
    expect(card("Avg Time to Consensus").getByText("Slower")).toBeTruthy();
  });

  it("says a direction the read gave no size bare, the same in every panel", () => {
    spy.result = {
      ...DASHBOARD,
      agreementChart: {
        points: [
          { date: "2026-10-01", timestamp: Date.UTC(2026, 9, 1), agreement: 40, issueTitle: "Login", roomName: "Sprint 42 planning" },
        ],
        trend: { direction: "declining", changePct: null },
      },
      timeToConsensus: {
        ...DASHBOARD.timeToConsensus,
        trend: { direction: "slower", changePct: null },
      },
    } satisfies Dashboard;
    renderOverview();

    expect(card("Agreement Trend").getByText("Trending down")).toBeTruthy();
    expect(card("Avg Time to Consensus").getByText("Slower")).toBeTruthy();
  });

  it("shows skeletons and no numbers until the read lands", () => {
    renderOverview();

    expect(screen.queryByText("Total Sessions")).toBeNull();
    expect(screen.queryByText("Avg Time to Consensus")).toBeNull();
    expect(screen.queryByText("No active sessions")).toBeNull();
  });
});
