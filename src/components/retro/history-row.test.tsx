/**
 * The history row (spec §17, ADR-0024): name, created date, format name,
 * attribution, resting stage, the coverage facts when a walk exists and
 * this retro's action counts, each routing to its board; the cards-due
 * date and the viewer's own hint (spec §16.5) on the collect rows. The
 * counts are plain text, never links, and no count is coloured by value.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { HistoryRow as Row } from "@/convex/model/retro";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { HistoryRows } from "./history-row";
import { STAGE_LABELS } from "@/convex/retroCopy";

afterEach(cleanup);

const base = (over: Partial<Row> & Pick<Row, "roomId" | "name">): Row => ({
  createdAt: Date.UTC(2026, 8, 5, 12),
  formatName: "Start, Stop, Continue",
  attribution: "named",
  stageKind: "close",
  counts: { open: 3, done: 2, dropped: 1 },
  ...over,
});

describe("HistoryRows", () => {
  it("renders the spec's fields for a closed retro with a walk, linking to the board", () => {
    render(
      <HistoryRows
        rows={[base({ roomId: "r1" as never, name: "Sprint 42", coverage: { covered: 7, total: 10 } })]}
      />
    );
    const row = screen.getByTestId("retro-row");
    expect(row.getAttribute("data-stage")).toBe("close");
    const text = row.textContent ?? "";
    expect(text).toContain("Sprint 42");
    expect(text).toMatch(/Created 5 Sept 2026|Created 5 Sep 2026/);
    expect(text).toContain("Start, Stop, Continue");
    expect(text).toContain("Named");
    expect(text).toContain(STAGE_LABELS.close);
    expect(text).toContain("7 of 10 covered");
    expect(text).not.toContain("new");
    expect(within(row).getByTestId("action-counts").textContent).toBe("3 open · 2 done · 1 dropped");
    expect(screen.getByRole("link", { name: /Sprint 42/ }).getAttribute("href")).toBe("/room/r1");
    // One link per row: the counts are facts, not doors (ADR-0024).
    expect(within(row).getAllByRole("link")).toHaveLength(1);
  });

  it("omits the coverage line without a walk and never shows a card count or a last-active time", () => {
    render(<HistoryRows rows={[base({ roomId: "r1" as never, name: "Fresh", stageKind: "collect", attribution: "anonymous" })]} />);
    const text = screen.getByTestId("retro-row").textContent ?? "";
    expect(text).not.toMatch(/covered/);
    expect(text).not.toMatch(/cards?\b/i);
    expect(text).not.toMatch(/active|ago/i);
    expect(text).toContain("Anonymous");
  });

  it("keeps the rows in the order given, the cards-due date and the viewer's own hint on the rows that carry them", () => {
    render(
      <HistoryRows
        rows={[
          base({ roomId: "r1" as never, name: "Collecting", stageKind: "collect", collectUntil: Date.UTC(2026, 8, 10), noCardYet: true }),
          base({ roomId: "r2" as never, name: "Anonymous one", stageKind: "collect", attribution: "anonymous" }),
        ]}
      />
    );
    const rows = screen.getAllByTestId("retro-row");
    expect(rows.map((row) => row.getAttribute("data-stage"))).toEqual(["collect", "collect"]);
    expect(rows[0].textContent).toMatch(/Cards due/);
    expect(rows[0].textContent).toContain("You haven't added a card yet");
    expect(rows[1].textContent).not.toMatch(/Cards due/);
    expect(rows[1].textContent).not.toContain("You haven't added a card yet");
    expect(screen.getByRole("link", { name: /Anonymous one/ }).getAttribute("href")).toBe("/room/r2");
  });

  it("colours no count by value: the same classes whatever the numbers", () => {
    render(
      <HistoryRows
        rows={[
          base({ roomId: "r1" as never, name: "Busy", counts: { open: 9, done: 0, dropped: 4 } }),
          base({ roomId: "r2" as never, name: "Quiet", counts: { open: 0, done: 5, dropped: 0 } }),
        ]}
      />
    );
    const [busy, quiet] = screen.getAllByTestId("action-counts");
    expect(busy.className).toBe(quiet.className);
    expect(busy.className).not.toMatch(/red|amber|green|status-/);
  });
});
